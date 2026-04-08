import WorkflowDetailPage from "../[id]/page";

export default function NewWorkflowPage() {
  return <WorkflowDetailPage params={Promise.resolve({ id: "new" })} />;
}
