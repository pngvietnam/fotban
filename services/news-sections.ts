import type { NewsStory } from "../types/news-ui";

/** Read-model grouping only. Reliability and publication decisions belong to M7/M8. */
export function newsSections(stories: NewsStory[], firstPage: boolean) {
  const unique = stories.filter((story, index, all) => all.findIndex((other) => other.slug === story.slug) === index);
  const top = firstPage ? unique.slice(0, 2) : [];
  const remaining = unique.slice(top.length).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.slug.localeCompare(b.slug));
  const latest = remaining.slice(0, 2);
  const categories = remaining.slice(latest.length);
  const transfers = categories.filter((story) => story.storyType === "TRANSFER");
  const offField = categories.filter((story) => ["OFF_FIELD", "INTERVIEW", "COMMUNITY", "SOCIAL"].includes(story.storyType));
  const players = categories.filter((story) => !transfers.includes(story) && !offField.includes(story) && (story.storyType === "PLAYER" || story.entities.some((entity) => entity.kind === "player")));
  const clubs = categories.filter((story) => !transfers.includes(story) && !offField.includes(story) && !players.includes(story));
  return [{ title: "Đáng chú ý", stories: top }, { title: "Mới cập nhật", stories: latest }, { title: "Chuyện câu lạc bộ", stories: clubs }, { title: "Chuyện cầu thủ", stories: players }, { title: "Chuyển nhượng · Điểm tin", stories: transfers }, { title: "Ngoài sân cỏ & văn hóa bóng đá", stories: offField }].filter((section) => section.stories.length);
}
