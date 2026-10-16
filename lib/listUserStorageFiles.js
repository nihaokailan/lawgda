export async function listUserStorageFiles(supabase, bucket, userId) {
  const files = [];

  async function visit(prefix) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      return;
    }

    const subfolders = [];
    for (const item of data ?? []) {
      if (!item.name) {
        continue;
      }

      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFile = Boolean(item.id || item.metadata);
      if (isFile) {
        files.push({ ...item, path });
      } else {
        subfolders.push(path);
      }
    }

    // List sibling folders concurrently instead of one round trip at a time.
    await Promise.all(subfolders.map(visit));
  }

  await visit(userId);
  return files;
}
