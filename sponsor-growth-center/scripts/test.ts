import { getSql } from '../lib/db';
import { getOverview, getCampaignPerformance, getPipeline, getTrend } from '../lib/metrics';
import { executeTool, runReadOnlySql } from '../lib/copilot';
import { createTask, updateOpportunity, logInteraction, updateCampaign } from '../lib/actions';
import { resetDatabase } from '../lib/seed';

let fails = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : ` want ${JSON.stringify(want)}`}`);
}

async function main() {
  await resetDatabase();
  const o = await getOverview('2025-04-20');
  check('confirmed partnerships (latest)', o.funnel.partnerships_confirmed, 24);
  check('confirmed value', o.value.confirmed_value_inr, 2240000);
  check('confirmed in-kind', o.value.confirmed_in_kind_inr, 240000);
  check('qualified brands (latest)', o.funnel.brands_qualified, 60);
  check('brands reached', o.funnel.brands_reached, 180);
  check('outreach attempts', o.funnel.outreach_attempts, 370);
  check('opportunities', o.funnel.opportunities, 58);
  check('open pipeline', o.value.open_pipeline_inr, 1440000);
  check('goal version at 20 Apr', o.goals?.version, 'Sponsor revised plan');
  check('opt-outs', o.funnel.opt_outs, 7);
  const g14 = (await getOverview('2025-03-14')).goals?.version;
  check('goal version at 14 Mar (no leak)', g14, 'Sponsor launch plan');
  const g15 = (await getOverview('2025-03-15')).goals?.version;
  check('goal version at 15 Mar', g15, 'Sponsor revised plan');
  const sql = getSql();
  const [{ raw }] = await sql`select count(*)::int raw from sponsor_interactions`;
  const [{ dedup }] = await sql`select count(*)::int dedup from v_interactions`;
  check('raw vs dedup interactions', [raw, dedup], [953, 950]);
  const camps = await getCampaignPerformance('2025-04-20');
  const sc01 = camps.find((c: any) => c.sponsor_campaign_id === 'SC01') as any;
  check('SC01 attempts/brands/positive/meetings/qualified/opps/confirmed/open', [sc01.attempts, sc01.brands_reached, sc01.positive_brands, sc01.meetings_held_brands, sc01.qualified, sc01.opportunities, sc01.confirmed, sc01.open_pipeline], [224, 91, 14, 7, 7, 11, 0, 490000]);
  const sc05 = camps.find((c: any) => c.sponsor_campaign_id === 'SC05') as any;
  check('SC05 confirmed / value', [sc05.confirmed, sc05.confirmed_value], [9, 785000]);
  console.log('recommendations', camps.map((c: any) => `${c.campaign_name}: ${c.recommendation}`).join(' | '));
  console.log('cash', JSON.stringify(o.cash), 'spend', JSON.stringify(o.spend));
  const early = await getOverview('2025-02-15');
  console.log('15 Feb snapshot', JSON.stringify(early.funnel), JSON.stringify(early.value));
  const pipe = await getPipeline('2025-04-20', { stage: 'negotiating' });
  check('negotiating deals', pipe.length, 8);
  const tr = await getTrend('2025-04-20');
  console.log('trend points', tr.length, JSON.stringify(tr[tr.length - 1]));
  // SQL tool safety
  check('sql blocks delete', !!(await runReadOnlySql('delete from tasks')).error, true);
  check('sql blocks multi-statement', !!(await runReadOnlySql('select 1; drop table tasks')).error, true);
  const r = await runReadOnlySql("select industry, count(*) n from brands group by 1 order by 2 desc");
  console.log('sql ok', JSON.stringify(r).slice(0, 200));
  const ro = await runReadOnlySql("select * from (select 1) x where exists (select set_config('a','b',false))");
  console.log('set_config attempt ->', JSON.stringify(ro).slice(0, 120));
  // tools
  const cmp: any = await executeTool('compare_snapshots', { from_date: '2025-03-01', to_date: '2025-04-01' }, '2025-04-20');
  console.log('compare change', JSON.stringify(cmp.change));
  // mutations update analytics
  await updateOpportunity('O037', { stage: 'partner_confirmed', confirmed_value_inr: 55000 }, '2025-04-20');
  const o2 = await getOverview('2025-04-20');
  check('after confirming O037: confirmed count', o2.funnel.partnerships_confirmed, 25);
  check('after confirming O037: value', o2.value.confirmed_value_inr, 2295000);
  const o3 = await getOverview('2025-04-10');
  check('edit at 20 Apr not leaking to 10 Apr', o3.funnel.partnerships_confirmed, (await (async () => { await resetDatabase(); return (await getOverview('2025-04-10')).funnel.partnerships_confirmed; })()));
  await logInteraction({ brand_id: 'A120', sponsor_campaign_id: 'SC01', event_type: 'replied', outcome: 'positive' }, '2025-04-20');
  const c2 = (await getCampaignPerformance('2025-04-20')).find((c: any) => c.sponsor_campaign_id === 'SC01') as any;
  console.log('SC01 positive brands after logging reply', c2.positive_brands);
  const t = await createTask({ title: 'Test task', owner_name: 'Kabir Shah', due_date: '2025-04-05', created_by: 'copilot' });
  check('task created by copilot', (t as any).created_by, 'copilot');
  await updateCampaign('SC01', { status: 'paused' });
  const c3 = (await getCampaignPerformance('2025-04-20')).find((c: any) => c.sponsor_campaign_id === 'SC01') as any;
  check('campaign paused', c3.status, 'paused');
  await resetDatabase();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await sql.end();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
