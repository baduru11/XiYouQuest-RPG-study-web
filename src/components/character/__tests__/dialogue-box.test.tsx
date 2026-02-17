import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { DialogueBox } from "../dialogue-box";

afterEach(() => {
  cleanup();
});

describe("DialogueBox", () => {
  it("renders the character name", () => {
    render(<DialogueBox text="Hello!" characterName="Kaede" isTyping={false} />);
    expect(screen.getByText("Kaede")).toBeInTheDocument();
  });

  it("shows full text immediately when isTyping is false", () => {
    render(<DialogueBox text="Hello world!" characterName="Kaede" isTyping={false} />);
    expect(screen.getByText("Hello world!")).toBeInTheDocument();
  });

  it("shows skip button during typing animation", () => {
    vi.useFakeTimers();
    render(<DialogueBox text="Hello world!" characterName="Kaede" isTyping={true} typingSpeed={50} />);

    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText(/Skip/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("types text progressively", () => {
    vi.useFakeTimers();
    render(<DialogueBox text="AB" characterName="Kaede" isTyping={true} typingSpeed={50} />);

    // After 1 tick, first character should appear
    act(() => { vi.advanceTimersByTime(50); });
    // The text node contains "A" plus cursor "_" in a span
    expect(screen.getByText(/^A$/)).toBeInTheDocument();

    // After 2 ticks, second character appears
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText("AB")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("hides skip button when text completes", () => {
    vi.useFakeTimers();
    render(<DialogueBox text="Hi" characterName="Kaede" isTyping={true} typingSpeed={50} />);

    // Complete the typing
    act(() => { vi.advanceTimersByTime(150); }); // 50 * 2 chars + extra tick
    expect(screen.queryByText(/Skip/)).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
