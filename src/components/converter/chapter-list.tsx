import { type TocItem } from "@/lib/types"

export function ChapterList({ items, depth, onSelect }: {
  items: TocItem[]; depth: number; onSelect: (page: number) => void
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${depth}-${i}`}>
          <div
            className="px-3 py-1.5 text-[12px] cursor-pointer hover:bg-accent/50 border-b border-border/20 truncate transition-colors"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            onClick={() => onSelect(item.page)}
          >
            {item.title}
          </div>
          {item.children && item.children.length > 0 && (
            <ChapterList items={item.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </div>
      ))}
    </>
  )
}
