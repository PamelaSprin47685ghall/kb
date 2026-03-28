import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineCreateCard } from "../InlineCreateCard";
import type { Task, Column } from "@kb/core";

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Link: () => null,
}));

// Mock the api module
vi.mock("../../api", () => ({
  uploadAttachment: vi.fn(),
}));

function renderCard(tasks: Task[] = []) {
  const props = {
    tasks,
    onSubmit: vi.fn().mockResolvedValue({ id: "KB-001" }),
    onCancel: vi.fn(),
    addToast: vi.fn(),
  };
  const result = render(<InlineCreateCard {...props} />);
  return { ...result, props };
}

describe("InlineCreateCard blur-to-cancel", () => {
  it("calls onCancel when focus leaves the card with empty input", () => {
    const { props } = renderCard();
    const textarea = screen.getByPlaceholderText("What needs to be done?");

    textarea.focus();
    fireEvent.focusOut(textarea, { relatedTarget: null });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCancel when focus leaves with non-empty input", () => {
    const { props } = renderCard();
    const textarea = screen.getByPlaceholderText("What needs to be done?");

    fireEvent.change(textarea, { target: { value: "Some task description" } });
    fireEvent.focusOut(textarea, { relatedTarget: null });

    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("does NOT call onCancel when focus moves to another element inside the card", () => {
    const { props } = renderCard();
    const textarea = screen.getByPlaceholderText("What needs to be done?");
    const depsButton = screen.getByText(/Deps/);

    textarea.focus();
    fireEvent.focusOut(textarea, { relatedTarget: depsButton });

    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when blur with only whitespace input", () => {
    const { props } = renderCard();
    const textarea = screen.getByPlaceholderText("What needs to be done?");

    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.focusOut(textarea, { relatedTarget: null });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("InlineCreateCard dep-dropdown focus retention", () => {
  const testTasks: Task[] = [
    { id: "KB-010", title: "Task A", description: "First task", column: "todo" as Column, dependencies: [], steps: [], currentStep: 0, log: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ];

  it("dep-dropdown-item mouseDown calls preventDefault to retain focus", () => {
    renderCard(testTasks);
    // Open the dropdown
    fireEvent.click(screen.getByText(/Deps/));
    const item = document.querySelector(".dep-dropdown-item") as HTMLElement;
    expect(item).toBeTruthy();

    // Fire mouseDown and verify preventDefault was called —
    // this is the mechanism that keeps focus on the search input in
    // real browsers and prevents a focusout with relatedTarget: null
    const prevented = !fireEvent.mouseDown(item);
    expect(prevented).toBe(true);
  });

  it("does NOT call onCancel when focus leaves card with selected dependencies but empty description", () => {
    const { props } = renderCard(testTasks);
    const textarea = screen.getByPlaceholderText("What needs to be done?");

    // Open dropdown and select a dependency
    fireEvent.click(screen.getByText(/Deps/));
    const item = document.querySelector(".dep-dropdown-item") as HTMLElement;
    expect(item).toBeTruthy();
    fireEvent.click(item);

    // Focus the textarea then blur out of the card entirely
    textarea.focus();
    fireEvent.focusOut(textarea, { relatedTarget: null });

    expect(props.onCancel).not.toHaveBeenCalled();
  });
});

describe("InlineCreateCard dependency dropdown search", () => {
  const testTasks: Task[] = [
    { id: "KB-001", title: "Fix login", description: "Login page broken", column: "todo" as Column, dependencies: [], steps: [], currentStep: 0, log: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: "KB-002", title: "Add dark mode", description: "Theme support", column: "todo" as Column, dependencies: [], steps: [], currentStep: 0, log: [], createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" },
    { id: "KB-003", title: "Refactor API", description: "Clean up endpoints", column: "todo" as Column, dependencies: [], steps: [], currentStep: 0, log: [], createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
  ];

  it("shows search input when dropdown is opened", () => {
    renderCard(testTasks);
    fireEvent.click(screen.getByText(/Deps/));
    const input = document.querySelector(".dep-dropdown-search") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe("Search tasks…");
  });

  it("filters tasks by search term", () => {
    renderCard(testTasks);
    fireEvent.click(screen.getByText(/Deps/));
    const input = document.querySelector(".dep-dropdown-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "dark" } });

    const items = document.querySelectorAll(".dep-dropdown-item");
    expect(items).toHaveLength(1);
    expect(items[0].querySelector(".dep-dropdown-id")?.textContent).toBe("KB-002");
  });
});
