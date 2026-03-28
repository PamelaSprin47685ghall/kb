import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../Header";

describe("Header", () => {
  it("renders a logo image with correct src and alt", () => {
    render(<Header />);
    const logo = screen.getByAltText("kb logo");
    expect(logo).toBeDefined();
    expect(logo.tagName).toBe("IMG");
    expect((logo as HTMLImageElement).src).toContain("/logo.svg");
  });

  it("renders the logo before the h1 element", () => {
    render(<Header />);
    const logo = screen.getByAltText("kb logo");
    const h1 = screen.getByRole("heading", { level: 1 });
    // Logo should be a preceding sibling of the h1
    expect(logo.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the settings button", () => {
    const onOpen = vi.fn();
    render(<Header onOpenSettings={onOpen} />);
    const btn = screen.getByTitle("Settings");
    expect(btn).toBeDefined();
  });

  it("renders pause button with 'Pause AI engine' title when not paused", () => {
    render(<Header globalPaused={false} />);
    const btn = screen.getByTitle("Pause AI engine");
    expect(btn).toBeDefined();
  });

  it("renders play button with 'Resume AI engine' title when paused", () => {
    render(<Header globalPaused={true} />);
    const btn = screen.getByTitle("Resume AI engine");
    expect(btn).toBeDefined();
  });

  it("calls onToggleGlobalPause when pause button is clicked", () => {
    const onToggle = vi.fn();
    render(<Header globalPaused={false} onToggleGlobalPause={onToggle} />);
    const btn = screen.getByTitle("Pause AI engine");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("applies btn-icon--paused class when paused", () => {
    render(<Header globalPaused={true} />);
    const btn = screen.getByTitle("Resume AI engine");
    expect(btn.className).toContain("btn-icon--paused");
  });

  it("does not apply btn-icon--paused class when not paused", () => {
    render(<Header globalPaused={false} />);
    const btn = screen.getByTitle("Pause AI engine");
    expect(btn.className).not.toContain("btn-icon--paused");
  });
});
