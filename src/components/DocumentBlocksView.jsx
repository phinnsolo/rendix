import ExamBlocks from './ExamBlocks.jsx'

// Consignas del parcial tal como las armó el profesor, sin áreas de respuesta.
export default function DocumentBlocksView({ blocks }) {
  return (
    <div className="blocks">
      <ExamBlocks blocks={blocks} showAnswers={false} />
    </div>
  )
}
