import { client } from "@kaneo/libs";

async function getProjectAgentActivity(projectId: string) {
  const response = await client["agent-activity"][":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getProjectAgentActivity;
