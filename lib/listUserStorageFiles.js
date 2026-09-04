export async function listUserStorageFiles(supabase, bucket, userId) {
  const files = [];

  async function visit(prefix) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      return;
    }

    for (const item of data ?? []) {
      if (!item.name) {
        continue;
      }

      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFile = Boolean(item.id || item.metadata);
      if (isFile) {
        files.push({ ...item, path });
      } else {
        await visit(path);
      }
    }
  }

  await visit(userId);
  return files;
}
