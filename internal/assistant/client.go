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
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []chatMessage   `json:"messages"`
	Temperature    float64         `json:"temperature"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"` // "json_object"
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
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
	buf, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := strings.TrimRight(s.cfg.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)
	}

	resp, err := s.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("assistant backend: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}

	var parsed chatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("assistant backend: HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	if resp.StatusCode >= 400 {
		msg := truncate(string(body), 200)
		if parsed.Error != nil {
			msg = parsed.Error.Message
		}
		return "", fmt.Errorf("assistant backend: HTTP %d: %s", resp.StatusCode, msg)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("assistant backend: empty response")
	}
	return parsed.Choices[0].Message.Content, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
