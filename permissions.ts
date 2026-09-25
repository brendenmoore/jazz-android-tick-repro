import { schema as s } from "jazz-tools";
import { app } from "./schema";
import { permissions as authPermissions } from "./auth-schema";
const permissions = s.definePermissions(app, ({ policy, session }) => {
  policy.todos.allowRead.where({ ownerId: session.user.account });
  policy.todos.allowInsert.where({ ownerId: session.user.account });
  policy.todos.allowUpdate
    .whereOld({ ownerId: session.user.account })
    .whereNew({ ownerId: session.user.account });
  policy.todos.allowDelete.where({ ownerId: session.user.account });
  policy.subtasks.allowRead.where({ ownerId: session.user.account });
  policy.subtasks.allowInsert.where({ ownerId: session.user.account });
  policy.subtasks.allowUpdate
    .whereOld({ ownerId: session.user.account })
    .whereNew({ ownerId: session.user.account });
  policy.subtasks.allowDelete.where({ ownerId: session.user.account });
});
export default { ...authPermissions, ...permissions };
