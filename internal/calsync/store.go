package calsync

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
)

// creds are an external source's stored credentials.
type creds struct {
	Username string `json:"u"`
	Password string `json:"p"`
}

// deriveKey builds a 32-byte AES key from CREDENTIALS_KEY (or SESSION_SECRET).
func deriveKey() []byte {
	s := os.Getenv("CREDENTIALS_KEY")
	if s == "" {
		s = os.Getenv("SESSION_SECRET")
	}
	if s == "" {
		s = "tribo-dev-credentials-key"
	}
	h := sha256.Sum256([]byte(s))
	return h[:]
}

// seal encrypts bytes with AES-GCM → base64(nonce|ciphertext).
func (e *Engine) seal(plain []byte) (string, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, plain, nil)), nil
}

func (e *Engine) open(s string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}

// encrypt seals CalDAV credentials.
func (e *Engine) encrypt(c creds) (string, error) {
	plain, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	return e.seal(plain)
}

func (e *Engine) decrypt(s string) (creds, error) {
	if s == "" {
		return creds{}, nil
	}
	plain, err := e.open(s)
	if err != nil {
		return creds{}, err
	}
	var c creds
	return c, json.Unmarshal(plain, &c)
}

func (e *Engine) loadSource(id string) (sourceRow, error) {
	var src sourceRow
	var credStr string
	var ro int
	err := e.db.QueryRow(
		`SELECT id, type, COALESCE(url, ''), COALESCE(credentials, ''), read_only FROM calendar_source WHERE id = ?`, id).
		Scan(&src.id, &src.typ, &src.url, &credStr, &ro)
	if err != nil {
		return src, err
	}
	src.readOnly = ro != 0
	c, err := e.decrypt(credStr)
	if err != nil {
		return src, err
	}
	src.creds = c
	return src, nil
}

func (e *Engine) externalSources() ([]sourceRow, error) {
	rows, err := e.db.Query(`SELECT id FROM calendar_source WHERE type IN ('caldav', 'google')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]sourceRow, 0, len(ids))
	for _, id := range ids {
		src, err := e.loadSource(id)
		if err != nil {
			return nil, err
		}
		out = append(out, src)
	}
	return out, nil
}
