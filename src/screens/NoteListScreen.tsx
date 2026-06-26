import { useEffect, useMemo, useState } from 'react';
import type { AppData } from '../types';
import { BackButton } from '../components/BackButton';
import { CategoryNotePanel } from '../components/CategoryNoteDrawer';
import { Layout } from '../components/Layout';
import { buildProblemCategories, normalizeProblemCategory } from './ProblemSetDetailScreen';
import { getQuestionsBySet } from '../utils/quiz';
import './NoteListScreen.css';

interface NoteListScreenProps {
  data: AppData;
  setId: string;
  onBack: () => void;
}

export function NoteListScreen({ data, setId, onBack }: NoteListScreenProps) {
  const problemSet = data.problemSets.find((set) => set.id === setId);
  const questions = useMemo(() => getQuestionsBySet(data, setId), [data, setId]);
  const noteCategories = useMemo(() => {
    const categories = buildProblemCategories(questions).filter((category) => category !== 'すべて');
    if (categories.length > 0) return categories;
    return [normalizeProblemCategory(questions[0]?.category)];
  }, [questions]);
  const [selectedCategory, setSelectedCategory] = useState(() => noteCategories[0] ?? '未分類');

  useEffect(() => {
    if (!noteCategories.includes(selectedCategory)) {
      setSelectedCategory(noteCategories[0] ?? '未分類');
    }
  }, [noteCategories, selectedCategory]);

  const title = problemSet?.title ?? '問題セット';

  return (
    <Layout>
      <div className="quiz-notes">
        <header className="quiz-notes__header">
          <div className="quiz-notes__header-slope" />
          <BackButton onClick={onBack} className="quiz-notes__back-button" />
          <div className="quiz-notes__title-wrap">
            <h1>ノート一覧</h1>
            <p>{title}</p>
          </div>
        </header>

        <main className="quiz-notes__body">
          <aside className="quiz-notes__categories" aria-label="分類別ノート">
            <div className="quiz-notes__section-title">
              <span>分類</span>
              <strong>{noteCategories.length}</strong>
            </div>
            <div className="quiz-notes__category-list">
              {noteCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`quiz-notes__category${selectedCategory === category ? ' quiz-notes__category--active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  <span>{category}</span>
                  <b aria-hidden="true">›</b>
                </button>
              ))}
            </div>
          </aside>

          <section className="quiz-notes__panel-wrap">
            <CategoryNotePanel key={selectedCategory} problemSetId={setId} category={selectedCategory} className="quiz-notes__panel" onClose={onBack} />
          </section>

          <section className="quiz-notes__unsupported">
            <h2>ノート一覧</h2>
            <p>ノート機能はタブレット横画面で表示されます。</p>
          </section>
        </main>
      </div>
    </Layout>
  );
}