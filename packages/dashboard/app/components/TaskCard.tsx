import { useCallback, useState } from "react";
import type { Task, TaskDetail, TaskStatus } from "@hai/core";
import { STATUS_LABELS, STATUS_COLORS } from "@hai/core";
import { fetchTaskDetail } from "../api";
import type { ToastType } from "../hooks/useToast";

interface TaskCardProps {
  task: Task;
  onOpenDetail: (task: TaskDetail) => void;
  addToast: (message: string, type?: ToastType) => void;
}

export function TaskCard({ task, onOpenDetail, addToast }: TaskCardProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }, [task.id]);

  const handleDragEnd = useCallback(() => {
    setDragging(false);
  }, []);

  const handleClick = useCallback(async () => {
    try {
      const detail = await fetchTaskDetail(task.id);
      onOpenDetail(detail);
    } catch (err: any) {
      addToast(err.message, "error");
    }
  }, [task.id, onOpenDetail, addToast]);

  const status: TaskStatus = task.status ?? "idle";
  const showBadge = status !== "idle";
  const isPulsing = status === "specifying" || status === "executing";

  return (
    <div
      className={`card${dragging ? " dragging" : ""}`}
      data-id={task.id}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      <span className="card-id">{task.id}</span>
      {showBadge && (
        <span
          className={`card-status-badge${isPulsing ? " pulsing" : ""}`}
          style={{
            color: STATUS_COLORS[status],
            background: STATUS_COLORS[status].startsWith("var(")
              ? `color-mix(in srgb, ${STATUS_COLORS[status]} 15%, transparent)`
              : `${STATUS_COLORS[status]}26`,
          }}
        >
          {STATUS_LABELS[status]}
        </span>
      )}
      <div className="card-title">{task.title}</div>
      {task.dependencies && task.dependencies.length > 0 && (
        <div className="card-meta">
          <span className="card-dep-badge">
            ⛓ {task.dependencies.length} dep{task.dependencies.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
