import { z } from "zod";
import type { SyncDatabase } from "../lib/sync-database";
import { adminAudit } from "./admin-access";
import { adminText, AdminError } from "../lib/admin-policy";
/** Operator-only initial bootstrap. Never imported by an HTTP route. */
export async function bootstrapAdmin(db:SyncDatabase,id:string,reason:string,confirm:boolean) {
  if(!z.uuid().safeParse(id).success||!adminText(1000).min(5).safeParse(reason).success||!confirm) throw new AdminError("INVALID_INPUT");
  return db.transaction(async tx=>{
    await tx.query("SELECT 1 FROM pg_advisory_xact_lock(91531116)");
    if((await tx.query('SELECT id FROM "User" WHERE role=\'ADMIN\' FOR UPDATE')).length) throw new AdminError("CONFLICT",409);
    const [user]=await tx.query<{role:string}>('SELECT role FROM "User" WHERE id=$1::uuid FOR UPDATE',[id]);
    if(!user) throw new AdminError("NOT_FOUND",404);
    await tx.query('UPDATE "User" SET role=\'ADMIN\',"updatedAt"=now() WHERE id=$1::uuid',[id]);
    return adminAudit(tx,id,"ADMIN_BOOTSTRAP","User",id,reason,{role:user.role},{role:"ADMIN",operator:true});
  });
}
