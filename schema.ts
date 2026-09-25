import { schema as s } from "jazz-tools";
import { schema as authSchema } from "./auth-schema";
const schema = {
  ...authSchema,
  todos: s.table(
    { title: s.string(), done: s.boolean(), ownerId: s.uuid() },
    { subtasks: s.reverse("subtasks", "todo") },
  ),
  subtasks: s.table(
    {
      title: s.string(),
      done: s.boolean(),
      ownerId: s.uuid(),
      todoId: s.uuid(),
    },
    { todo: s.rel("todos", "todoId") },
  ),
};
type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);
