interface Props {
  bookId: string
  selectedSceneId: string | null
  onSelectScene: (id: string | null) => void
}

export default function BookWriteView(_props: Props) {
  return <div className="book-write" />
}
