alter table public.problem_reports
  drop constraint if exists problem_reports_reason_check;

alter table public.problem_reports
  add constraint problem_reports_reason_check
  check (reason in (
    'incorrect_answer',
    'incorrect_explanation',
    'unclear_question',
    'duplicate',
    'copyright',
    'other',
    'incorrect',
    'inappropriate',
    'spam'
  ));

comment on column public.problem_reports.reason is 'Structured quality report reason selected by the reporter.';
