package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Minimal OpenAI-compatible chat-completions client. Deliberately SDK-free:
// the /v1/chat/completions surface is the lingua franca implemented by
// Anthropic, Gemini, Ollama, vLLM and friends, and we only need one blocking
// JSON call.

type chatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"` // on role:"tool" replies
}

type toolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"` // "function"
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"` // JSON-encoded args
	} `json:"function"`
}

// toolDef is an OpenAI-style function tool definition.
type toolDef struct {
	Type     string `json:"type"` // "function"
	Function struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
	} `json:"function"`
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []chatMessage   `json:"messages"`
	Temperature    float64         `json:"temperature"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
	Tools          []toolDef       `json:"tools,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"` // "json_object"
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// complete sends a system+user prompt and returns the assistant text. It asks
// for JSON output; if the backend rejects response_format (not all
// OpenAI-compatible servers support it), it retries once without.
func (s *Service) complete(ctx context.Context, system, user string) (string, error) {
	out, err := s.completeOnce(ctx, system, user, true)
	if err != nil && strings.Contains(err.Error(), "response_format") {
		out, err = s.completeOnce(ctx, system, user, false)
	}
	return out, err
}

func (s *Service) completeOnce(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	reqBody := chatRequest{
		Model: s.cfg.Model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.4,
	}
	if jsonMode {
		reqBody.ResponseFormat = &responseFormat{Type: "json_object"}
	}
	msg, err := s.send(ctx, reqBody)
	if err != nil {
		return "", err
	}
	return msg.Content, nil
}

// chatRound sends a full conversation (+ optional tools) and returns the
// assistant's next message, which may carry tool calls.
func (s *Service) chatRound(ctx context.Context, msgs []chatMessage, tools []toolDef) (*chatMessage, error) {
	return s.send(ctx, chatRequest{Model: s.cfg.Model, Messages: msgs, Temperature: 0.4, Tools: tools})
}

func (s *Service) send(ctx context.Context, reqBody chatRequest) (*chatMessage, error) {
	buf, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := strings.TrimRight(s.cfg.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)
	}

	resp, err := s.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("assistant backend: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var parsed chatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("assistant backend: HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	if resp.StatusCode >= 400 {
		msg := truncate(string(body), 200)
		if parsed.Error != nil {
			msg = parsed.Error.Message
		}
		return nil, fmt.Errorf("assistant backend: HTTP %d: %s", resp.StatusCode, msg)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("assistant backend: empty response")
	}
	return &parsed.Choices[0].Message, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
