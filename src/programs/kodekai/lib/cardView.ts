import type { Card, Priority, TagId } from "../model/model";

export type DueFilter = "all" | "overdue" | "upcoming";
export type CardSort = "manual" | "due-date" | "priority";

export interface CardViewOptions {
  query: string;
  priority: Priority | "all";
  due: DueFilter;
  tagId: TagId | undefined;
  sort: CardSort;
  today: Date;
}

const priorityRank: Record<Priority, number> = { urgent: 0, normal: 1, low: 2 };

/** Filters and sorts cards without changing their stored manual positions. */
export function visibleCards(cards: readonly Card[], options: CardViewOptions): Card[] {
  const query = options.query.trim().toLocaleLowerCase();
  const startOfToday = new Date(options.today);
  startOfToday.setHours(0, 0, 0, 0);

  return cards
    .filter((card) => {
      if (query && !`${card.title} ${card.content}`.toLocaleLowerCase().includes(query))
        return false;
      if (options.priority !== "all" && card.priority !== options.priority) return false;
      if (options.tagId && !card.tagIds.includes(options.tagId)) return false;
      const due = new Date(card.expiration);
      if (options.due === "overdue" && due >= startOfToday) return false;
      if (options.due === "upcoming" && due < startOfToday) return false;
      return true;
    })
    .sort((left, right) => {
      const order =
        options.sort === "due-date"
          ? left.expiration.localeCompare(right.expiration)
          : options.sort === "priority"
            ? priorityRank[left.priority] - priorityRank[right.priority]
            : 0;
      return order || left.displayIndex - right.displayIndex || left.id.localeCompare(right.id);
    });
}
