import type { Task, TaskDetail } from "@hai/core";
import { TaskCard } from "./TaskCard";
import type { ToastType } from "../hooks/useToast";

interface WorktreeGroupProps {
  label: string;
  activeTasks: Task[];
  queuedTasks: Task[];
  onOpenDetail: (task: TaskDetail) => void;
  addToast: (message: string, type?: ToastType) => void;
}

export function WorktreeGroup({
  label,
  activeTasks,
  queuedTasks,
  onOpenDetail,
  addToast,
}: WorktreeGroupProps) {
  return (
    <div className="worktree-group">
      <div className="worktree-group-header">
        <span className="worktree-icon">
          {label === "Up Next" || label === "Unassigned" ? "📋" : "🌿"}
        </span>
        <span className="worktree-label">{label}</span>
      </div>
      {activeTasks.map((task) => (
        <TaskCard key={task.id} task={task} onOpenDetail={onOpenDetail} addToast={addToast} />
      ))}
      {queuedTasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          queued
          onOpenDetail={onOpenDetail}
          addToast={addToast}
        />
      ))}
    </div>
  );
}
