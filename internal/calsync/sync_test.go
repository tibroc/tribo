package calsync

import (
	"crypto/sha256"
	"strings"
	"testing"
	"time"

	"github.com/emersion/go-ical"
)

const sampleICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:evt-123@example.com
SUMMARY:Dentist
DTSTART:20260618T143000Z
DTEND:20260618T151500Z
LOCATION:Dr. Costa
END:VEVENT
BEGIN:VEVENT
UID:bday-1@example.com
SUMMARY:Grandma's birthday
DTSTART;VALUE=DATE:20260618
DTEND;VALUE=DATE:20260619
END:VEVENT
END:VCALENDAR
`

func TestICalToEvent(t *testing.T) {
	cal, err := ical.NewDecoder(strings.NewReader(sampleICS)).Decode()
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	events := cal.Events()
	if len(events) != 2 {
		t.Fatalf("want 2 events, got %d", len(events))
	}

	timed, ok := icalToEvent(events[0], time.UTC)
	if !ok || timed.uid != "evt-123@example.com" || timed.title != "Dentist" || timed.allDay {
		t.Fatalf("timed event mapped wrong: %+v ok=%v", timed, ok)
	}
	if timed.location != "Dr. Costa" {
		t.Fatalf("location not mapped: %q", timed.location)
	}

	allDay, ok := icalToEvent(events[1], time.UTC)
	if !ok || !allDay.allDay || allDay.title != "Grandma's birthday" {
		t.Fatalf("all-day event mapped wrong: %+v ok=%v", allDay, ok)
	}
}

func TestCredsRoundTrip(t *testing.T) {
	key := sha256.Sum256([]byte("test-key"))
	e := &Engine{key: key[:]}
	enc, err := e.encrypt(creds{Username: "alice", Password: "s3cret"})
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	got, err := e.decrypt(enc)
	if err != nil || got.Username != "alice" || got.Password != "s3cret" {
		t.Fatalf("round trip failed: %+v err=%v", got, err)
	}

	// A different key must fail to open.
	other := sha256.Sum256([]byte("other-key"))
	if _, err := (&Engine{key: other[:]}).decrypt(enc); err == nil {
		t.Fatal("decrypt with wrong key should fail")
	}
}
