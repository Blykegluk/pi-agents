import AgentEditPage from "../[name]/page";

export default function NewAgentPage() {
  return <AgentEditPage params={Promise.resolve({ name: "new" })} />;
}
