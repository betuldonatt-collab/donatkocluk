import { redirect } from "next/navigation";

// The old detailed report-card page is retired: a report card now has ONE printable version -- the unified Karne the coach previews and
// prints and the student reads (components/karne-document.tsx). A link to an old card lands on that same document, for that card.
export default async function ParentKarneDetailPage(props: PageProps<"/parent/karne/[id]">) {
  const { id } = await props.params;
  redirect(`/parent/karne?card=${encodeURIComponent(id)}`);
}
