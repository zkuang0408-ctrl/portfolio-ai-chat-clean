export const ACTIVATE_PROJECT_EVENT = "portfolio:activate-project";

export interface ProjectActivationDetail {
  readonly projectId: string;
}

export function readProjectActivation(
  event: Event,
): ProjectActivationDetail | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return undefined;
  }
  const projectId = (detail as Record<string, unknown>).projectId;
  if (typeof projectId !== "string" || projectId.length === 0) {
    return undefined;
  }
  return { projectId };
}

export function dispatchProjectActivation(
  root: HTMLElement,
  projectId: string,
): void {
  const EventConstructor =
    root.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
  root.dispatchEvent(
    new EventConstructor<ProjectActivationDetail>(ACTIVATE_PROJECT_EVENT, {
      detail: { projectId },
    }),
  );
}
