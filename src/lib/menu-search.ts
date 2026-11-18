import type { Dish } from "@/lib/data";

function editDistanceAtMostOne(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

export function matchesDishSearch(dish: Dish, query: string) {
  const queryTokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!queryTokens.length) return true;
  const haystack = [
    dish.name,
    dish.description,
    dish.category,
    ...(dish.categories || []),
    ...(dish.dietaryTags || []),
  ].join(" ").toLocaleLowerCase();
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return queryTokens.every((token) =>
    words.some((word) =>
      word.includes(token) || (token.length >= 5 && editDistanceAtMostOne(word, token)),
    ),
  );
}
