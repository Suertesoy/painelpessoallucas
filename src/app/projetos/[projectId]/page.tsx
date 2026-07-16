export default function ProjetoDetalhePage({ params }: { params: { projectId: string } }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Detalhes do Projeto</h1>
      <p className="text-gray-600">ID: {params.projectId}</p>
    </div>
  );
}
