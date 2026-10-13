import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndexingProgressModal } from '@/components/IndexingProgressModal';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import type { Project } from '@/lib/api';

const sampleProject: Project = {
  projectId: 'sample-project-id',
  name: 'vulnerable-mern-app',
  path: '/app/sandbox-target',
  status: 'indexed',
  findingsCount: 4,
};

describe('IndexingProgressModal', () => {
  it('renders in-flight progress with all 5 indexing stages', () => {
    render(
      <IndexingProgressModal
        isOpen={true}
        isComplete={false}
        projectName="vulnerable-mern-app"
        projectPath="/app/sandbox-target"
        onOpenProject={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Indexing Repository in Progress')).toBeInTheDocument();
    expect(screen.getByText('Stage 1 of 5')).toBeInTheDocument();
    expect(screen.getByText('Validating workspace & directory structure')).toBeInTheDocument();
    expect(screen.getByText('Parsing AST syntax trees')).toBeInTheDocument();
    expect(screen.getByText('Extracting Mongoose schemas & data models')).toBeInTheDocument();
    expect(screen.getByText('Constructing Security Graph')).toBeInTheDocument();
    expect(screen.getByText('Finalizing repository registration')).toBeInTheDocument();
  });

  it('renders error notice when indexing fails', () => {
    render(
      <IndexingProgressModal
        isOpen={true}
        isComplete={false}
        projectName="broken-app"
        projectPath="/bad/path"
        error="Directory not found: /bad/path"
        onOpenProject={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Indexing Failed')).toBeInTheDocument();
    expect(screen.getByText('Directory not found: /bad/path')).toBeInTheDocument();
  });
});

describe('ConfirmDeleteModal', () => {
  it('renders project details and database un-index explanation', () => {
    render(
      <ConfirmDeleteModal
        isOpen={true}
        project={sampleProject}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Un-index Project')).toBeInTheDocument();
    expect(screen.getByText('vulnerable-mern-app')).toBeInTheDocument();
    expect(screen.getAllByText('/app/sandbox-target').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/4 associated security findings will be purged/i)).toBeInTheDocument();
    expect(screen.getByText(/Database Purge Only:/i)).toBeInTheDocument();
    expect(screen.getByText('Un-index & Delete')).toBeInTheDocument();
  });

  it('triggers onConfirm when un-index button is clicked', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmDeleteModal
        isOpen={true}
        project={sampleProject}
        onConfirm={handleConfirm}
        onClose={() => {}}
      />,
    );

    const deleteBtn = screen.getByRole('button', { name: /Un-index & Delete/i });
    await fireEvent.click(deleteBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when Cancel button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ConfirmDeleteModal
        isOpen={true}
        project={sampleProject}
        onConfirm={() => {}}
        onClose={handleClose}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
