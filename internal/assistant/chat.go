package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"tribo/internal/tools"
)

// The in-app chat assistant (phase 2, mockup option D): a tool-calling loop
// over the same shared tool layer the MCP server uses. Guardrails: child
// profiles get read tools plus completing their *own* chores/todos — never
// event/todo creation. Writes are executed and clearly reported via the tool
// trace the UI renders under each reply.

// ChatMessage is the transport shape for the conversation history (the client
// keeps state; the server is stateless).
type ChatMessage struct {
	Role    string `json:"role"` // user | assistant
	Content string `json:"content"`
}

// ChatEvent is one server-sent event during a chat turn.
type ChatEvent struct {
	Type    string `json:"type"`              // tool | message | error
	Name    string `json:"name,omitempty"`    // tool name (type=tool)
	Status  string `json:"status,omitempty"`  // start | ok | error (type=tool)
	Content string `json:"content,omitempty"` // reply text (type=message) / error text
}

const maxToolRounds = 6

// chatTool couples an OpenAI function definition with its guarded dispatcher.
type chatTool struct {
	name        string
	description string
	params      string // JSON schema of the arguments
	guardianOnly bool
	call        func(ctx context.Context, d *tools.Deps, g Profile, args json.RawMessage) (any, error)
}

// Profile is the acting profile the guardrails check against. An empty
// MemberID/Role (no active profile, dev mode) gets guardian privileges,
// matching the rest of the app.
type Profile struct {
	MemberID string
	Role     string // guardian | child
}

func (g Profile) isChild() bool { return g.Role == "child" }

var chatTools = []chatTool{
	{
		name: "get_today", description: "List today's family events.",
		params: `{"type":"object","properties":{}}`,
		call: func(_ context.Context, d *tools.Deps, _ Profile, _ json.RawMessage) (any, error) {
			return d.Today()
		},
	},
	{
		name: "get_briefing", description: "Today's events plus pending chores and open to-dos.",
		params: `{"type":"object","properties":{}}`,
		call: func(_ context.Context, d *tools.Deps, _ Profile, _ json.RawMessage) (any, error) {
			return d.Briefing(), nil
		},
	},
	{
		name: "check_availability", description: "Who is free in a time window (events + work schedules).",
		params: `{"type":"object","properties":{"from":{"type":"string","description":"window start, RFC3339"},"to":{"type":"string","description":"window end, RFC3339"}},"required":["from","to"]}`,
		call: func(_ context.Context, d *tools.Deps, _ Profile, args json.RawMessage) (any, error) {
			var in tools.AvailabilityIn
			if err := json.Unmarshal(args, &in); err != nil {
				return nil, err
			}
			return d.CheckAvailability(in)
		},
	},
	{
		name: "add_event", description: "Create a calendar event. Returns guardian assignment if applicable.",
		params: `{"type":"object","properties":{"title":{"type":"string"},"start":{"type":"string","description":"start time, RFC3339"},"end":{"type":"string","description":"end time, RFC3339"},"allDay":{"type":"boolean"},"attendeeIds":{"type":"array","items":{"type":"string"},"description":"family member ids"},"requiresGuardian":{"type":"boolean"}},"required":["title","start","end"]}`,
		guardianOnly: true,
		call: func(ctx context.Context, d *tools.Deps, _ Profile, args json.RawMessage) (any, error) {
			var in tools.AddEventIn
			if err := json.Unmarshal(args, &in); err != nil {
				return nil, err
			}
			return d.AddEvent(ctx, in)
		},
	},
	{
		name: "add_todo", description: "Add a to-do item, optionally assigned to a family member.",
		params: `{"type":"object","properties":{"title":{"type":"string"},"assignedMemberId":{"type":"string"}},"required":["title"]}`,
		guardianOnly: true,
		call: func(_ context.Context, d *tools.Deps, _ Profile, args json.RawMessage) (any, error) {
			var in tools.AddTodoIn
			if err := json.Unmarshal(args, &in); err != nil {
				return nil, err
			}
			return d.AddTodo(in)
		},
	},
	{
		name: "complete_todo", description: "Mark a to-do done.",
		params: `{"type":"object","properties":{"todoId":{"type":"string"}},"required":["todoId"]}`,
		call: func(_ context.Context, d *tools.Deps, g Profile, args json.RawMessage) (any, error) {
			var in tools.CompleteTodoIn
			if err := json.Unmarshal(args, &in); err != nil {
				return nil, err
			}
			if g.isChild() {
				assignee, ok := d.TodoAssignee(in.TodoID)
				if !ok {
					return nil, fmt.Errorf("todo not found")
				}
				if assignee != "" && assignee != g.MemberID {
					return nil, fmt.Errorf("this to-do belongs to someone else")
				}
			}
			return d.CompleteTodo(in)
		},
	},
	{
		name: "complete_chore", description: "Mark a chore instance done.",
		params: `{"type":"object","properties":{"instanceId":{"type":"string"},"memberId":{"type":"string","description":"who completed it"}},"required":["instanceId"]}`,
		call: func(ctx context.Context, d *tools.Deps, g Profile, args json.RawMessage) (any, error) {
			var in tools.CompleteChoreIn
			if err := json.Unmarshal(args, &in); err != nil {
				return nil, err
			}
			if g.isChild() {
				assignee, ok := d.ChoreInstanceAssignee(in.InstanceID)
				if !ok {
					return nil, fmt.Errorf("chore not found")
				}
				if assignee != "" && assignee != g.MemberID {
					return nil, fmt.Errorf("this chore is assigned to someone else")
				}
				in.MemberID = g.MemberID // children complete as themselves
			}
			return d.CompleteChore(ctx, in)
		},
	},
}

// toolDefsFor renders the OpenAI tool definitions the acting profile may use.
func toolDefsFor(g Profile) []toolDef {
	var defs []toolDef
	for _, ct := range chatTools {
		if ct.guardianOnly && g.isChild() {
			continue
		}
		var d toolDef
		d.Type = "function"
		d.Function.Name = ct.name
		d.Function.Description = ct.description
		d.Function.Parameters = json.RawMessage(ct.params)
		defs = append(defs, d)
	}
	return defs
}

func findChatTool(name string) *chatTool {
	for i := range chatTools {
		if chatTools[i].name == name {
			return &chatTools[i]
		}
	}
	return nil
}

// chatSystemPrompt grounds the model: date/time in the family timezone, the
// member roster with ids (so tool calls reference real people), the acting
// profile, and scope rules.
func (s *Service) chatSystemPrompt(d *tools.Deps, g Profile, now time.Time) string {
	var b strings.Builder
	b.WriteString("You are the assistant inside Tribo, a self-hosted family organizer. You help this family check their schedule, prioritize, and manage chores and to-dos using the provided tools.\n\n")
	fmt.Fprintf(&b, "Now: %s (family timezone).\n", now.Format("Monday, 2006-01-02 15:04"))
	b.WriteString("Family members (use these ids in tool calls):\n")
	members, _ := d.Members()
	names := map[string]string{}
	for _, m := range members {
		fmt.Fprintf(&b, "- %s (id: %s, role: %s)\n", m.Name, m.ID, m.Role)
		names[m.ID] = m.Name
	}
	if g.MemberID != "" {
		who := names[g.MemberID]
		fmt.Fprintf(&b, "\nYou are talking to: %s (role: %s).\n", who, g.Role)
	}
	if g.isChild() {
		b.WriteString("This is a child profile: you may show information and complete their own chores/to-dos, but never create events or to-dos, and never act on other members' items.\n")
	}
	fmt.Fprintf(&b, "\nAnswer in language %q. Be concise and warm — one short paragraph unless listing items. Use tools to look up real data before answering; never invent events, chores, or ids. After a write action, confirm plainly what was done. Only help with family organization; politely decline anything else.", s.cfg.Language)
	return b.String()
}

// Chat runs one assistant turn: it sends the history, executes any tool calls
// (emitting trace events), and loops until the model answers in text. The
// final text is emitted as a "message" event. Stateless: history comes from
// the client each turn.
func (s *Service) Chat(ctx context.Context, d *tools.Deps, g Profile, history []ChatMessage, emit func(ChatEvent)) error {
	if !s.Enabled() {
		return ErrDisabled
	}
	now := time.Now().In(s.familyLocation())

	msgs := []chatMessage{{Role: "system", Content: s.chatSystemPrompt(d, g, now)}}
	for _, m := range history {
		if m.Role != "user" && m.Role != "assistant" {
			continue
		}
		msgs = append(msgs, chatMessage{Role: m.Role, Content: m.Content})
	}

	defs := toolDefsFor(g)
	for round := 0; ; round++ {
		reply, err := s.chatRound(ctx, msgs, defs)
		if err != nil && defs != nil && strings.Contains(err.Error(), "HTTP 400") {
			// Backend likely doesn't support tool calling — degrade to read-only Q&A.
			defs = nil
			reply, err = s.chatRound(ctx, msgs, nil)
		}
		if err != nil {
			return err
		}

		if len(reply.ToolCalls) == 0 || round >= maxToolRounds {
			content := strings.TrimSpace(reply.Content)
			if content == "" {
				content = "…"
			}
			emit(ChatEvent{Type: "message", Content: content})
			return nil
		}

		msgs = append(msgs, *reply)
		for _, tc := range reply.ToolCalls {
			result := s.execTool(ctx, d, g, tc, emit)
			msgs = append(msgs, chatMessage{Role: "tool", ToolCallID: tc.ID, Content: result})
		}
	}
}

// execTool dispatches one call with guardrails, emitting start/ok/error trace
// events, and returns the JSON payload handed back to the model.
func (s *Service) execTool(ctx context.Context, d *tools.Deps, g Profile, tc toolCall, emit func(ChatEvent)) string {
	name := tc.Function.Name
	emit(ChatEvent{Type: "tool", Name: name, Status: "start"})

	fail := func(msg string) string {
		emit(ChatEvent{Type: "tool", Name: name, Status: "error"})
		out, _ := json.Marshal(map[string]string{"error": msg})
		return string(out)
	}

	ct := findChatTool(name)
	if ct == nil {
		return fail("unknown tool: " + name)
	}
	if ct.guardianOnly && g.isChild() {
		return fail("not allowed for a child profile")
	}
	args := json.RawMessage(tc.Function.Arguments)
	if len(args) == 0 {
		args = json.RawMessage(`{}`)
	}
	res, err := ct.call(ctx, d, g, args)
	if err != nil {
		return fail(err.Error())
	}
	emit(ChatEvent{Type: "tool", Name: name, Status: "ok"})
	out, err := json.Marshal(res)
	if err != nil {
		return fail(err.Error())
	}
	return string(out)
}
