"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

// A local safety net for a part of a page (a modal, a card): if something
// inside throws WHILE RENDERING, `fallback` is shown in its place instead of
// the whole page going down, and the error is reported to Sentry rather than
// shown. `fallback` receives `reset` to try rendering the children again.
//
// This only catches render-time errors. A failed Server Action or fetch inside
// an event handler never reaches a boundary -- those are turned into readable
// Turkish by friendlyError (lib/friendly-error.ts) where they are caught.
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (reset: () => void) => ReactNode; context?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    Sentry.captureException(error, { extra: { context: this.props.context ?? null, componentStack: info.componentStack } });
  }

  reset = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
