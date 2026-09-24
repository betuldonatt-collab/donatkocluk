"use client";

import { createContext, useContext } from "react";

// profiles.is_maarif9 for the student whose panel/page is being rendered,
// provided once near the top of the coach student pages and the student
// layout so deeply nested client forms can read it without threading a new
// prop beside `examType` through a dozen components. Defaults to false, so
// anything rendered outside a provider (and every existing student) behaves
// exactly as before.
const Maarif9Context = createContext(false);

export function Maarif9Provider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <Maarif9Context.Provider value={value}>{children}</Maarif9Context.Provider>;
}

export function useIsMaarif9(): boolean {
  return useContext(Maarif9Context);
}
