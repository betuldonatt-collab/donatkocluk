import { StudentSidebar } from "./_components/sidebar";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <div className="flex flex-1">
      <StudentSidebar />
      <main className="flex-1 md:ml-64">{children}</main>
    </div>
  );
}
