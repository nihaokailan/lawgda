import { getSupabaseAdmin } from './supabaseAdmin';

/**
 * Writes one append-only row to granular_audit_log. This is the low-level
 * primitive — prefer performAuditedUpdate() below for actual writes, since it
 * calls this automatically and diffs fields for you.
 */
export async function logGranularAudit({
  actorUserId,
  actorRole,
  action,
  resourceTable,
  resourceId,
  fieldName = null,
  oldValue = null,
  newValue = null,
  metadata = {},
  orgId = null,
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('granular_audit_log').insert([
    {
      actor_user_id: actorUserId,
      actor_role: actorRole,
      action,
      resource_table: resourceTable,
      resource_id: String(resourceId),
      field_name: fieldName,
      old_value: oldValue === null || oldValue === undefined ? null : String(oldValue),
      new_value: newValue === null || newValue === undefined ? null : String(newValue),
      metadata,
      org_id: orgId,
    },
  ]);

  if (error) {
    throw new Error(`Unable to write granular audit log entry: ${error.message}`);
  }
}

/**
 * Intercepts an update: reads the current row, applies only the supplied
 * fields, and writes one granular_audit_log row per field that actually
 * changed (old value -> new value) before returning the updated row.
 *
 * This is the only supported way for a Paralegal/Staff write path to mutate
 * a row — "including typo fixes" per the accountability requirement — so
 * logging can never be accidentally skipped by a route handler.
 */
export async function performAuditedUpdate({
  table,
  id,
  idColumn = 'id',
  updates,
  actorUserId,
  actorRole,
  metadata = {},
  orgId = null,
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: before, error: fetchError } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq(idColumn, id)
    .single();

  if (fetchError || !before) {
    throw new Error(`Record not found in "${table}" for audited update.`);
  }

  const changedFields = Object.keys(updates).filter((key) => before[key] !== updates[key]);

  if (changedFields.length === 0) {
    return before;
  }

  const { data: after, error: updateError } = await supabaseAdmin
    .from(table)
    .update(updates)
    .eq(idColumn, id)
    .select('*')
    .single();

  if (updateError || !after) {
    throw new Error(`Audited update failed on "${table}": ${updateError?.message ?? 'unknown error'}`);
  }

  await Promise.all(
    changedFields.map((field) =>
      logGranularAudit({
        actorUserId,
        actorRole,
        action: 'update',
        resourceTable: table,
        resourceId: id,
        fieldName: field,
        oldValue: before[field],
        newValue: after[field],
        metadata,
        orgId,
      })
    )
  );

  return after;
}
