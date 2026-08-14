import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AppData, ProblemSetVisibility } from '../types';
import { BackButton } from '../components/BackButton';
import { Layout } from '../components/Layout';
import { DocumentOutlineIcon } from '../components/UiIcons';
import { writeClipboardText } from '../utils/nativePlatform';
import {
  buildShareUrl,
  cloudConfigured,
  createCloudGroup,
  createGroupInvite,
  getCloudDisplayName,
  getCloudSession,
  getSharedProblemSet,
  joinCloudGroup,
  listCloudGroupMembers,
  listGroupProblemSets,
  listMyGroups,
  listMyPublishedSets,
  listPublicProblemSets,
  onCloudAuthStateChange,
  publishLocalProblemSet,
  recordCloudCopy,
  removeCloudGroupMember,
  reportCloudProblemSet,
  sendMagicLink,
  signOutCloud,
  type CloudGroup,
  type CloudGroupMember,
  type CloudProblemSet,
  type CloudPublishResult,
  unpublishCloudProblemSet,
} from '../utils/cloudService';
import './CommunityScreen.css';

export type CommunityTab = 'mine' | 'groups' | 'discover';

interface CommunityScreenProps {
  data: AppData;
  initialTab?: CommunityTab;
  initialSetId?: string;
  shareToken?: string;
  onBack: () => void;
  onCreateProblemSet: () => void;
  onOpenLocalSet: (setId: string) => void;
  onCopySharedSet: (set: CloudProblemSet) => Promise<string | null>;
  onPracticeSharedSet: (set: CloudProblemSet) => void;
  onPublished: (localSetId: string, result: CloudPublishResult) => Promise<void>;
  onUnpublished: (localSetId: string) => Promise<void>;
}

export function CommunityScreen({
  data,
  initialTab = 'mine',
  initialSetId,
  shareToken = '',
  onBack,
  onCreateProblemSet,
  onOpenLocalSet,
  onCopySharedSet,
  onPracticeSharedSet,
  onPublished,
  onUnpublished,
}: CommunityScreenProps) {
  const [tab, setTab] = useState<CommunityTab>(shareToken ? 'discover' : initialTab);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [publicSets, setPublicSets] = useState<CloudProblemSet[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publishedSets, setPublishedSets] = useState<CloudProblemSet[]>([]);
  const [groups, setGroups] = useState<CloudGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupSets, setGroupSets] = useState<CloudProblemSet[]>([]);
  const [groupMembers, setGroupMembers] = useState<CloudGroupMember[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [shareLocalSetId, setShareLocalSetId] = useState(() => initialSetId && !shareToken && initialTab === 'mine' ? initialSetId : '');
  const [shareVisibility, setShareVisibility] = useState<Exclude<ProblemSetVisibility, 'private'>>('link');
  const [shareGroupIds, setShareGroupIds] = useState<string[]>([]);
  const [shareResult, setShareResult] = useState<{ url: string; visibility: ProblemSetVisibility } | null>(null);
  const [directSet, setDirectSet] = useState<CloudProblemSet | null>(null);
  const [detailBackTab, setDetailBackTab] = useState<'discover' | 'groups'>('discover');
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [reportTarget, setReportTarget] = useState<CloudProblemSet | null>(null);
  const [reportReason, setReportReason] = useState('incorrect_answer');
  const [reportDetails, setReportDetails] = useState('');
  const publicRequestIdRef = useRef(0);
  const isPrimaryRoot = !initialSetId && !shareToken && (initialTab === 'discover' || initialTab === 'groups');
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const canManageSelectedGroup = selectedGroup?.role === 'owner' || selectedGroup?.role === 'admin';
  const subjectOptions = useMemo(() => [...new Set(publicSets.map((set) => set.subject).filter(Boolean))].sort(), [publicSets]);
  const visiblePublicSets = useMemo(() => publicSets.filter((set) => (
    (subjectFilter === 'all' || set.subject === subjectFilter)
    && (difficultyFilter === 'all' || set.difficulty === difficultyFilter)
  )), [publicSets, subjectFilter, difficultyFilter]);
  const orphanedPublishedSets = useMemo(() => publishedSets.filter((published) => !data.problemSets.some((local) => (
    local.cloudSetId === published.id || local.id === published.localSetId
  ))), [data.problemSets, publishedSets]);

  useEffect(() => {
    let active = true;
    void getCloudSession().then((value) => {
      if (!active) return;
      setSession(value);
      setAuthReady(true);
    });
    const unsubscribe = onCloudAuthStateChange((_event, value) => {
      setSession(value);
      setAuthReady(true);
      if (value) setLoginOpen(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!cloudConfigured || tab !== 'discover' || shareToken) return;
    const requestId = ++publicRequestIdRef.current;
    const timer = window.setTimeout(() => {
      setPublicLoading(true);
      setError('');
      void listPublicProblemSets(query, sort)
        .then((nextSets) => {
          if (publicRequestIdRef.current === requestId) setPublicSets(nextSets);
        })
        .catch((reason) => {
          if (publicRequestIdRef.current === requestId) setError(getErrorMessage(reason));
        })
        .finally(() => {
          if (publicRequestIdRef.current === requestId) setPublicLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      if (publicRequestIdRef.current === requestId) publicRequestIdRef.current += 1;
    };
  }, [tab, query, sort, shareToken]);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setGroups([]);
      setPublishedSets([]);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([listMyGroups(), listMyPublishedSets()])
      .then(([nextGroups, nextSets]) => {
        if (cancelled) return;
        setGroups(nextGroups);
        setPublishedSets(nextSets);
      })
      .catch((reason) => {
        if (!cancelled) setError(getErrorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!initialSetId || !shareToken || !cloudConfigured) return;
    setBusy(true);
    setError('');
    void getSharedProblemSet(initialSetId, shareToken)
      .then(setDirectSet)
      .catch((reason) => setError(getErrorMessage(reason)))
      .finally(() => setBusy(false));
  }, [initialSetId, shareToken]);

  useEffect(() => {
    if (!initialSetId || shareToken || initialTab === 'mine' || !cloudConfigured || !authReady || !session) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    void getSharedProblemSet(initialSetId)
      .then((set) => {
        if (!cancelled) {
          setDirectSet(set);
          setTab('discover');
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(getErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, initialSetId, initialTab, session, shareToken]);

  useEffect(() => {
    if (!initialSetId || shareToken || !authReady || session) return;
    setLoginOpen(true);
  }, [initialSetId, shareToken, authReady, session]);

  const requireLogin = () => {
    if (session) return true;
    setLoginOpen(true);
    return false;
  };

  const submitMagicLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMagicLink(email);
      setAuthMessage('ログイン用リンクをメールへ送りました。この画面に戻るとログインが完了します。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const openShare = (localSetId: string) => {
    setShareLocalSetId(localSetId);
    setShareResult(null);
    if (!requireLogin()) return;
    if (groups.length === 0) setShareVisibility('link');
  };

  const submitShare = async () => {
    if (!shareLocalSetId || !session) return;
    if (shareVisibility === 'group' && shareGroupIds.length === 0) {
      setError('共有先のグループを1つ以上選んでください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const profileName = await getCloudDisplayName().catch(() => '');
      const result = await publishLocalProblemSet({
        data,
        setId: shareLocalSetId,
        visibility: shareVisibility,
        groupIds: shareGroupIds,
        authorName: profileName || session.user.user_metadata.display_name || session.user.email?.split('@')[0] || 'Quiz Make ユーザー',
      });
      try {
        await onPublished(shareLocalSetId, result);
      } catch (localSaveError) {
        await unpublishCloudProblemSet(result.id).catch(() => undefined);
        throw localSaveError;
      }
      const url = buildShareUrl(result.id, result.shareToken);
      setShareResult({ url, visibility: result.visibility });
      setPublishedSets(await listMyPublishedSets());
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const copySharedSet = async (summary: CloudProblemSet, token = '') => {
    setBusy(true);
    setError('');
    try {
      const detail = summary.questions ? summary : await getSharedProblemSet(summary.id, token);
      const localSetId = await onCopySharedSet(detail);
      if (localSetId) {
        await recordCloudCopy(detail.id, localSetId).catch(() => undefined);
        setDirectSet((current) => current?.id === detail.id ? { ...current, addCount: current.addCount + 1 } : current);
        setPublicSets((items) => items.map((item) => item.id === detail.id ? { ...item, addCount: item.addCount + 1 } : item));
        onOpenLocalSet(localSetId);
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const practiceSharedSet = async (summary: CloudProblemSet, token = '') => {
    setBusy(true);
    setError('');
    try {
      const detail = summary.questions ? summary : await getSharedProblemSet(summary.id, token);
      onPracticeSharedSet(detail);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const openSharedDetail = async (summary: CloudProblemSet, backTab: 'discover' | 'groups') => {
    setBusy(true);
    setError('');
    try {
      setDirectSet(await getSharedProblemSet(summary.id));
      setDetailBackTab(backTab);
      setTab('discover');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async (localSetId: string | undefined, cloudSetId: string) => {
    setBusy(true);
    setError('');
    try {
      await unpublishCloudProblemSet(cloudSetId);
      if (localSetId && data.problemSets.some((problemSet) => problemSet.id === localSetId)) {
        await onUnpublished(localSetId);
      }
      setPublishedSets((items) => items.filter((item) => item.id !== cloudSetId));
      setAuthMessage('共有を停止しました。端末内の問題セットは残っています。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const refreshGroups = async () => {
    setGroups(await listMyGroups());
  };

  const createGroup = async () => {
    if (!newGroupName.trim() || !requireLogin()) return;
    setBusy(true);
    setError('');
    try {
      const created = await createCloudGroup(newGroupName);
      setNewGroupName('');
      await refreshGroups();
      setSelectedGroupId(created.id);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async () => {
    if (!inviteCode.trim() || !requireLogin()) return;
    setBusy(true);
    setError('');
    try {
      const joined = await joinCloudGroup(inviteCode);
      setInviteCode('');
      await refreshGroups();
      setSelectedGroupId(joined.id);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const openGroup = async (groupId: string) => {
    setSelectedGroupId(groupId);
    setBusy(true);
    setError('');
    try {
      const [nextSets, nextMembers] = await Promise.all([listGroupProblemSets(groupId), listCloudGroupMembers(groupId)]);
      setGroupSets(nextSets);
      setGroupMembers(nextMembers);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const removeGroupMember = async (member: CloudGroupMember) => {
    if (!selectedGroupId) return;
    setBusy(true);
    setError('');
    try {
      await removeCloudGroupMember(selectedGroupId, member.userId);
      if (member.userId === session?.user.id) {
        setSelectedGroupId('');
        setGroupMembers([]);
        setGroupSets([]);
        await refreshGroups();
      } else {
        setGroupMembers(await listCloudGroupMembers(selectedGroupId));
        await refreshGroups();
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (groupId: string) => {
    setBusy(true);
    setError('');
    try {
      const invite = await createGroupInvite(groupId);
      await writeClipboardText(invite.code);
      setAuthMessage(`招待コード ${invite.code} をコピーしました（7日間有効）。`);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    if (!session) {
      setReportTarget(null);
      setLoginOpen(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reportCloudProblemSet(reportTarget.id, reportReason, reportDetails);
      setReportTarget(null);
      setReportDetails('');
      setAuthMessage('通報を受け付けました。');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="community-screen">
        <header className="community-screen__header">
          {isPrimaryRoot ? <span className="community-screen__header-spacer" aria-hidden="true" /> : <BackButton onClick={onBack} label="戻る" />}
          <div><h1>{tab === 'groups' ? 'グループ' : tab === 'discover' ? '見つける' : '問題セット'}</h1></div>
          <span className="community-screen__header-spacer" aria-hidden="true" />
        </header>

        {!cloudConfigured ? <div className="community-notice community-notice--warning">共有機能の接続設定が未完了です。端末内の作成・学習機能はそのまま使えます。</div> : null}
        {error ? <div className="community-notice community-notice--error" role="alert">{error}<button type="button" onClick={() => setError('')}>閉じる</button></div> : null}
        {authMessage ? <div className="community-notice" role="status">{authMessage}<button type="button" onClick={() => setAuthMessage('')}>閉じる</button></div> : null}

        <main className="community-screen__body">
          {tab === 'mine' ? (
            <section className="community-section">
              <div className="community-section__heading">
                <div><h2>自分の問題セット</h2><p>端末内のデータは共有するまで非公開です。</p></div>
                <button type="button" onClick={onCreateProblemSet}>新規作成</button>
              </div>
              <div className="community-account">
                <span>{!authReady ? '確認中…' : session ? `${session.user.email ?? 'ログイン中'}` : '共有するときだけログイン'}</span>
                {session ? <span className="community-account__actions"><button type="button" onClick={() => void signOutCloud()}>ログアウト</button></span> : <button type="button" onClick={() => setLoginOpen(true)}>ログイン</button>}
              </div>
              <div className="community-card-list">
                {data.problemSets.map((set) => {
                  const count = data.questions.filter((question) => question.setId === set.id).length;
                  const published = publishedSets.find((item) => item.id === set.cloudSetId || item.localSetId === set.id);
                  return (
                    <article key={set.id} className="community-set-card">
                      <button type="button" className="community-set-card__main" onClick={() => onOpenLocalSet(set.id)}>
                        <span className="community-set-card__icon" aria-hidden="true"><DocumentOutlineIcon size={23} /></span>
                        <span><strong>{set.title}</strong><small>{count}問{set.subject ? ` · ${set.subject}` : ''}</small></span>
                      </button>
                      <div className="community-set-card__actions">
                        <button type="button" onClick={() => openShare(set.id)}>{published ? '更新' : '共有'}</button>
                        {published ? <button type="button" disabled={busy} onClick={() => void stopSharing(set.id, published.id)}>停止</button> : null}
                      </div>
                    </article>
                  );
                })}
                {orphanedPublishedSets.map((published) => (
                  <article key={published.id} className="community-set-card community-set-card--cloud-only">
                    <div className="community-set-card__main">
                      <span className="community-set-card__icon" aria-hidden="true"><DocumentOutlineIcon size={23} /></span>
                      <span><strong>{published.title}</strong><small>{published.questionCount}問 · クラウドにのみ残っています</small></span>
                    </div>
                    <div className="community-set-card__actions">
                      <button type="button" disabled={busy} onClick={() => void stopSharing(undefined, published.id)}>共有を停止</button>
                    </div>
                  </article>
                ))}
                {data.problemSets.length === 0 ? <EmptyState title="問題セットはまだありません" body="まず1つ作ると、ここから共有できます。" action="問題セットを作る" onAction={onCreateProblemSet} /> : null}
              </div>
            </section>
          ) : null}

          {tab === 'groups' ? (
            <section className="community-section">
              <div className="community-section__heading"><div><h2>グループ</h2><p>クラスや友人だけで問題セットを共有します。</p></div></div>
              {!session ? <EmptyState title="グループ機能はログイン後に使えます" body="問題作成と学習にはログイン不要です。" action="ログイン" onAction={() => setLoginOpen(true)} /> : (
                <>
                  <div className="community-group-actions">
                    <label>新しいグループ<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="例：英語ゼミ" /></label>
                    <button type="button" disabled={busy || !newGroupName.trim()} onClick={() => void createGroup()}>作成</button>
                    <label>招待コードで参加<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="12文字のコード" /></label>
                    <button type="button" disabled={busy || !inviteCode.trim()} onClick={() => void joinGroup()}>参加</button>
                  </div>
                  <div className="community-card-list">
                    {groups.map((group) => (
                      <article key={group.id} className={`community-group-card${selectedGroupId === group.id ? ' community-group-card--active' : ''}`}>
                        <button type="button" className="community-group-card__main" onClick={() => void openGroup(group.id)}>
                          <strong>{group.name}</strong><small>{group.memberCount}人 · {group.setCount}セット · {roleLabel(group.role)}</small>
                        </button>
                        {(group.role === 'owner' || group.role === 'admin') ? <button type="button" onClick={() => void copyInvite(group.id)}>招待</button> : null}
                      </article>
                    ))}
                  </div>
                  {selectedGroupId ? (
                    <>
                      <section className="community-members" aria-label="グループメンバー">
                        <h3>メンバー</h3>
                        {groupMembers.map((member) => (
                          <div key={member.userId}>
                            <span><strong>{member.displayName}</strong><small>{roleLabel(member.role)}</small></span>
                            {member.role !== 'owner' && (canManageSelectedGroup || member.userId === session.user.id) ? (
                              <button type="button" disabled={busy} onClick={() => void removeGroupMember(member)}>{member.userId === session.user.id ? '退出' : '削除'}</button>
                            ) : null}
                          </div>
                        ))}
                      </section>
                      <ProblemSetCards sets={groupSets} busy={busy} onCopy={(set) => void copySharedSet(set)} onPractice={(set) => void practiceSharedSet(set)} onDetail={(set) => void openSharedDetail(set, 'groups')} onReport={setReportTarget} />
                    </>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {tab === 'discover' ? (
            <section className="community-section">
              <div className="community-section__heading"><div><h2>{directSet ? '共有された問題セット' : '見つける'}</h2><p>追加すると自分用の独立したコピーになります。</p></div>{directSet && !shareToken ? <button type="button" onClick={() => { setDirectSet(null); setTab(detailBackTab); }}>一覧へ戻る</button> : null}</div>
              {directSet ? <ProblemSetCards sets={[directSet]} busy={busy} onCopy={(set) => void copySharedSet(set, shareToken)} onPractice={(set) => void practiceSharedSet(set, shareToken)} onReport={setReportTarget} detailed /> : (
                <>
                  <div className="community-search">
                    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・科目から検索" aria-label="公開問題セットを検索" />
                    <select value={sort} onChange={(event) => setSort(event.target.value as 'new' | 'popular')} aria-label="並び順"><option value="new">新着順</option><option value="popular">人気順</option></select>
                  </div>
                  <div className="community-filters" aria-label="絞り込み">
                    <label>科目<select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">すべて</option>{subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                    <label>難易度<select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="all">すべて</option><option value="basic">基礎</option><option value="standard">標準</option><option value="advanced">発展</option></select></label>
                  </div>
                  {publicLoading ? <div className="community-notice" role="status">公開問題セットを読み込み中…</div> : null}
                  <ProblemSetCards sets={visiblePublicSets} busy={busy || publicLoading} onCopy={(set) => void copySharedSet(set)} onPractice={(set) => void practiceSharedSet(set)} onDetail={(set) => void openSharedDetail(set, 'discover')} onReport={setReportTarget} />
                  {cloudConfigured && visiblePublicSets.length === 0 && !publicLoading ? <EmptyState title="条件に合うセットはありません" body="検索条件を変えるか、自分のセットを最初に公開してみましょう。" /> : null}
                </>
              )}
            </section>
          ) : null}

        </main>

        {loginOpen ? (
          <div className="community-overlay" onMouseDown={(event) => event.target === event.currentTarget && setLoginOpen(false)}>
            <section className="community-sheet" role="dialog" aria-modal="true" aria-label="ログイン">
              <h2>共有機能にログイン</h2><p>入力したメールへログイン用リンクを送ります。問題作成と学習だけならログインは不要です。</p>
              <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
              <div className="community-sheet__actions"><button type="button" onClick={() => setLoginOpen(false)}>キャンセル</button><button type="button" className="community-primary" disabled={busy || !email.trim()} onClick={() => void submitMagicLink()}>リンクを送る</button></div>
            </section>
          </div>
        ) : null}

        {shareLocalSetId && session ? (
          <div className="community-overlay" onMouseDown={(event) => event.target === event.currentTarget && setShareLocalSetId('')}>
            <section className="community-sheet" role="dialog" aria-modal="true" aria-label="問題セットを共有">
              <h2>問題セットを共有</h2>
              <p>{data.problemSets.find((set) => set.id === shareLocalSetId)?.title}</p>
              {!shareResult ? (
                <>
                  <label>公開範囲<select value={shareVisibility} onChange={(event) => setShareVisibility(event.target.value as Exclude<ProblemSetVisibility, 'private'>)}><option value="link">リンクを知っている人</option><option value="public">全体に公開</option><option value="group">グループだけ</option></select></label>
                  {shareVisibility === 'group' ? <fieldset><legend>共有先</legend>{groups.map((group) => <label key={group.id} className="community-check"><input type="checkbox" checked={shareGroupIds.includes(group.id)} onChange={(event) => setShareGroupIds((values) => event.target.checked ? [...values, group.id] : values.filter((id) => id !== group.id))} />{group.name}</label>)}</fieldset> : null}
                  <p className="community-sheet__hint">共有時点のコピーを公開します。端末内の元データや学習履歴は公開されません。</p>
                  <div className="community-sheet__actions"><button type="button" onClick={() => setShareLocalSetId('')}>キャンセル</button><button type="button" className="community-primary" disabled={busy} onClick={() => void submitShare()}>{busy ? '共有中…' : '共有する'}</button></div>
                </>
              ) : (
                <>
                  <div className="community-share-result"><strong>共有できました</strong><span>{shareResult.visibility === 'public' ? '「見つける」に公開中' : shareResult.visibility === 'group' ? '選択したグループに共有中' : 'リンクを知っている人だけ閲覧可能'}</span></div>
                  <button type="button" className="community-primary" onClick={() => void writeClipboardText(shareResult.url).then(() => setAuthMessage('共有リンクをコピーしました。'))}>共有リンクをコピー</button>
                  <button type="button" onClick={() => setShareLocalSetId('')}>閉じる</button>
                </>
              )}
            </section>
          </div>
        ) : null}

        {reportTarget ? (
          <div className="community-overlay" onMouseDown={(event) => event.target === event.currentTarget && setReportTarget(null)}>
            <section className="community-sheet" role="dialog" aria-modal="true" aria-label="問題セットを通報">
              <h2>問題セットを通報</h2><p>{reportTarget.title}</p>
              <label>理由<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="incorrect_answer">正解が誤っている</option><option value="incorrect_explanation">解説が誤っている</option><option value="unclear_question">問題文が不明確</option><option value="duplicate">重複している</option><option value="copyright">著作権上の問題</option><option value="other">その他</option></select></label>
              <label>詳細<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="確認に必要な情報（任意）" /></label>
              <div className="community-sheet__actions"><button type="button" onClick={() => setReportTarget(null)}>キャンセル</button><button type="button" className="community-danger" disabled={busy} onClick={() => void submitReport()}>通報する</button></div>
            </section>
          </div>
        ) : null}

      </div>
    </Layout>
  );
}

function ProblemSetCards({ sets, busy, onCopy, onPractice, onDetail, onReport, detailed = false }: { sets: CloudProblemSet[]; busy: boolean; onCopy: (set: CloudProblemSet) => void; onPractice: (set: CloudProblemSet) => void; onDetail?: (set: CloudProblemSet) => void; onReport: (set: CloudProblemSet) => void; detailed?: boolean }) {
  return <div className="community-public-list">{sets.map((set) => (
    <article key={set.id} className="community-public-card">
      <div className="community-public-card__top"><div><span>{set.subject || '未分類'}</span><h3>{set.title}</h3></div><small>更新 {formatDate(set.updatedAt)}</small></div>
      {set.description ? <p>{set.description}</p> : null}
      <div className="community-public-card__meta"><span>{set.questionCount}問</span><span>{difficultyLabel(set.difficulty)}</span><span>追加 {set.addCount}</span><span>作成：{set.authorName}</span></div>
      {detailed && set.questions ? <details><summary>問題の内容を確認</summary>{set.questions.slice(0, 5).map((question, index) => <div className="community-question-preview" key={`${index}_${question.question}`}><strong>{index + 1}. {question.question}</strong><span>{question.choices.join(' / ')}</span></div>)}</details> : null}
      <div className="community-public-card__actions"><button type="button" className="community-primary" disabled={busy} onClick={() => onPractice(set)}>このまま解く</button><button type="button" disabled={busy} onClick={() => onCopy(set)}>自分の問題に追加</button></div>
      <div className="community-public-card__minor-actions">{onDetail && !detailed ? <button type="button" onClick={() => onDetail(set)}>詳細を見る</button> : null}<button type="button" onClick={() => onReport(set)}>誤りを報告</button></div>
    </article>
  ))}</div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="community-empty"><span aria-hidden="true"><DocumentOutlineIcon size={30} /></span><h3>{title}</h3><p>{body}</p>{action && onAction ? <button type="button" className="community-primary" onClick={onAction}>{action}</button> : null}</div>;
}

function formatDate(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function difficultyLabel(value: string) {
  if (value === 'advanced') return '発展';
  if (value === 'standard') return '標準';
  return '基礎';
}

function roleLabel(value: CloudGroup['role']) {
  if (value === 'owner') return 'オーナー';
  if (value === 'admin') return '管理者';
  return 'メンバー';
}

function getErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : '操作を完了できませんでした。';
}
