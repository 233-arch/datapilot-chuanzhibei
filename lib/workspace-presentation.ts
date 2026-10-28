import type { Profile } from "./data-engine";

/** Completeness/duplicate score alone cannot establish that typed values are valid. */
export function qualityStatus(profile: Profile) {
  const invalid = profile.fields.reduce((sum, field) => sum + field.invalid, 0);
  const issues = profile.fields.filter(field => field.missing || field.invalid).length
    + (profile.duplicates > 0 ? 1 : 0);
  return {
    invalid,
    issues,
    title: profile.missing || profile.duplicates || invalid
      ? "发现可以改善的数据质量问题"
      : "数据状态良好，可以开始探索",
  };
}

/** Suggest only operations grounded in this table, without repeating fallback questions. */
export function starterQuestions(profile: Profile): string[] {
  const date = profile.fields.find(field => field.type === "date");
  const metric = profile.fields.find(field => field.type === "number")?.name;
  const dimensions = profile.fields.filter(field => field.type === "text" && field.unique < 30);
  const group = dimensions[0]?.name || date?.name || profile.fields[0]?.name;
  if (!group) return [];
  const candidates = [
    date ? `按月查看${metric || "记录数"}趋势` : `按${group}统计记录数`,
    `哪个${group}的${metric || "记录数"}最高？`,
    `分析${dimensions[1]?.name || group}的${metric || "记录数"}占比`,
  ];
  return [...new Set(candidates)];
}
