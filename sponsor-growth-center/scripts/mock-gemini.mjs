// Mock of the Gemini generateContent API used only for local plumbing tests.
import http from 'node:http';
const log = [];
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b);
    const last = body.contents[body.contents.length - 1];
    const fr = last.parts.find((p) => p.functionResponse);
    const echoed = body.contents.some((c) => c.role === 'model' && c.parts.some((p) => p.thoughtSignature === 'sig-1'));
    log.push({ hasSystem: !!body.systemInstruction, tools: body.tools[0].functionDeclarations.length, turns: body.contents.length, fr: fr?.functionResponse?.name, echoed });
    let parts;
    if (!fr) parts = [{ functionCall: { name: 'get_campaign_performance', args: { as_of: '2025-04-11' } }, thoughtSignature: 'sig-1' }];
    else if (fr.functionResponse.name === 'get_campaign_performance') {
      const sc01 = fr.functionResponse.response.result.campaigns.find((c) => c.sponsor_campaign_id === 'SC01');
      parts = [{ functionCall: { name: 'propose_task', args: { title: 'Rework Brand Discovery Email targeting', description: `SC01 positive reply rate ${(sc01.positive_reply_rate * 100).toFixed(1)}%, ${sc01.confirmed} confirmed`, owner_name: 'Kabir Shah', due_date: '2025-04-05', priority: 'high', sponsor_campaign_id: 'SC01' } } }];
    } else parts = [{ text: `**Brand Discovery Email** needs fixing. I proposed a task (log=${JSON.stringify(log)})` }];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }));
  });
}).listen(3200, () => console.log('mock gemini on 3200'));
