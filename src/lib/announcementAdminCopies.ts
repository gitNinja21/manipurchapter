// Phone-only delivery contacts; these do not create staff or administrator accounts.
export const ADMIN_ANNOUNCEMENT_PHONES = ["+919612738501", "+919930880277"] as const;
export function withAdminCopies(recipients: {id:string;phone:string|null}[]) {
 const result: {id:string|null;phone:string|null}[] = [...recipients];
 const phones = new Set(recipients.map(r=>r.phone));
 for (const phone of ADMIN_ANNOUNCEMENT_PHONES) {
  if (!phones.has(phone)) result.push({id:null,phone});
 }
 return result;
}
export function isAdminCopy(userId:string|null,phone:string|null) {
 return userId===null && ADMIN_ANNOUNCEMENT_PHONES.some(p=>p===phone);
}
