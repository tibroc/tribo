package calsync

import (
	"testing"
	"time"
)

func TestParseMonthDay(t *testing.T) {
	mo, day, ok := parseMonthDay("2014-03-10")
	if !ok || mo != time.March || day != 10 {
		t.Fatalf("parseMonthDay = (%v, %d, %v), want (March, 10, true)", mo, day, ok)
	}
	if _, _, ok := parseMonthDay(""); ok {
		t.Error("empty DOB should not parse")
	}
	if _, _, ok := parseMonthDay("03/10"); ok {
		t.Error("non-ISO DOB should not parse")
	}
}

func TestObjectPath(t *testing.T) {
	cases := map[string]string{
		"/tribo/birthdays/":   "/tribo/birthdays/bday-x-2026.ics",
		"/tribo/birthdays":    "/tribo/birthdays/bday-x-2026.ics",
		"http://h/tribo/fam/": "http://h/tribo/fam/bday-x-2026.ics",
	}
	for base, want := range cases {
		if got := objectPath(base, "bday-x-2026"); got != want {
			t.Errorf("objectPath(%q) = %q, want %q", base, got, want)
		}
	}
}
