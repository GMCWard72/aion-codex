const {test}=require('node:test'),assert=require('node:assert/strict');
const {parse,serialize,linkAndSplit,linkedChronicle,writeLinkedChronicle}=require('./model');
const {sortAgeYears,yearKey,numericYear}=require('./sorting');
const age=labels=>parse('# History\n'+labels.map((label,i)=>'## '+label+'\n### Custom Month '+i+'\n- Event '+i).join('\n'));
const labels=ages=>ages[0].years.map(year=>year.label);

test('two configured Eras count first downward, second upward, with missing notation in the second Era',()=>{
 const input=age(['5 CE','20 BCE','3','100 BCE','1 CE']);
 const output=sortAgeYears(input,0,['BCE','CE']);
 assert.deepEqual(labels(output),['100 BCE','20 BCE','1 CE','3','5 CE']);
 assert.deepEqual(labels(input),['5 CE','20 BCE','3','100 BCE','1 CE']);
 assert.deepEqual(yearKey('-10',['BCE','CE']),[1,-10]);
});
test('Era names are configurable and case insensitive; commas and attached Era suffixes work',()=>{
 const output=sortAgeYears(age(['20 after','1,000 BEFORE','300Before','1 AFTER']),0,['Before','After']);
 assert.deepEqual(labels(output),['1,000 BEFORE','300Before','1 AFTER','20 after']);
 assert.equal(numericYear('−2,000'),-2000);assert.equal(numericYear('1,00'),null);
});
test('zero or one Era uses the numeric sign even when Era text follows it',()=>{
 for(const eras of [[],[''],['BCE'],['','CE']]){
  const output=sortAgeYears(age(['20 BCE','-3 CE','−100 Unknown','0','+2 CE']),0,eras);
  assert.deepEqual(labels(output),['−100 Unknown','-3 CE','0','+2 CE','20 BCE']);
 }
});
test('named and unrecognised Years stay pinned and equal values preserve relative order',()=>{
 const input=age(['20 CE','Named Year','2 CE','2 CE','100 Unknown','1 CE']);
 const output=sortAgeYears(input,0,['BCE','CE']);
 assert.deepEqual(labels(output),['1 CE','Named Year','2 CE','2 CE','100 Unknown','20 CE']);
 assert.equal(output[0].years[2],input[0].years[2]);assert.equal(output[0].years[3],input[0].years[3]);
 assert.equal(yearKey('10-20 CE',['BCE','CE']),null);assert.equal(yearKey('100.5 CE',['BCE','CE']),null);
 assert.equal(yearKey('9007199254740992 CE',['BCE','CE']),null);
});
test('Starting Age is always unchanged; only the selected Age moves its Years with intact Date/Event payloads',()=>{
 const input=parse('# Beginning\n<!-- starting: true -->\n## 5 CE\n### Circa\n- Beginning\n## 1 CE\n### Rainwake\n- Later\n\n---\n\n# History\n## 5 CE\n### Zyth\n- Five\n### Aster\n- More\n## 1 CE\n### Rainwake\n- One\n\n---\n\n# Future\n## 99 CE\n### Prophecy\n- Future');
 assert.equal(sortAgeYears(input,0,['BCE','CE']),input);
 const output=sortAgeYears(input,1,['BCE','CE']);assert.deepEqual(output.map(a=>a.title),input.map(a=>a.title));
 assert.equal(output[0],input[0]);assert.equal(output[2],input[2]);assert.equal(output[1].years[1],input[1].years[0]);
 assert.deepEqual(output[1].years[1].groups.map(group=>group.title),['Zyth','Aster']);
 assert.deepEqual(parse(serialize(output)),output);
});
test('sorted Years save through the linked snapshot without moving Ages or changing other note text',()=>{
 const original=linkAndSplit('Before\n```aion-timeline\n# History\n## 20 CE\n### Circa\n- Twenty\n## 1 BCE\n### Circa\n- One\n\n---\n\n# Future\n## Future\n### Prophecy\n- Later\n```\nAfter');
 const state=linkedChronicle(original,'chronicle'),next=sortAgeYears(state.ages,0,['BCE','CE']);
 const output=writeLinkedChronicle(original,'chronicle',state.snapshot,next);
 assert.deepEqual(linkedChronicle(output,'chronicle').ages,next);assert.ok(output.startsWith('Before\n'));assert.ok(output.endsWith('After'));
 assert.throws(()=>writeLinkedChronicle(original.replace('Twenty','Edited'),'chronicle',state.snapshot,next),/changed/);
});

test('Dates sort Circa first, then configured Months with Month-only before numbered Days on either side',()=>{
 const {sortYearDates}=require('./sorting');
 const dates=['11th Frostmoot','Rainwake 20','Frostmoot','Circa','Rainwake','Frostmoot 2nd','3 Rainwake','Rainwake, 1st'];
 const input=parse('# History\n## Named Year\n'+dates.map((date,i)=>'### '+date+'\n- Event '+i).join('\n'));
 const output=sortYearDates(input,0,0,['Rainwake','Frostmoot']);
 assert.deepEqual(output[0].years[0].groups.map(g=>g.title),['Circa','Rainwake','Rainwake, 1st','3 Rainwake','Rainwake 20','Frostmoot','Frostmoot 2nd','11th Frostmoot']);
 assert.deepEqual(input[0].years[0].groups.map(g=>g.title),dates);
 for(const group of output[0].years[0].groups)assert.ok(input[0].years[0].groups.includes(group));
});
test('Date recognition handles multiword/custom Month names and stable equal Dates without guessing times or weekdays',()=>{
 const {dateKey,sortYearDates}=require('./sorting');
 const months=['Sun','Sun Moon','Rain [wake]'];
 assert.deepEqual(dateKey('11th Sun Moon',months),[1,11]);assert.deepEqual(dateKey('RAIN [WAKE] 40',months),[2,40]);
 assert.deepEqual(dateKey('Sun Moon',months),[1,0]);assert.equal(dateKey('Monday 11 Sun',months),null);assert.equal(dateKey('Sun 11 at noon',months),null);
 const input=parse('# History\n## Year\n### 11 Sun\n- First\n### Sun 2\n- Earlier\n### Sun 11th\n- Second');
 const output=sortYearDates(input,0,0,months);assert.deepEqual(output[0].years[0].groups.map(g=>g.events[0].text),['Earlier','First','Second']);
});
test('Circa takes precedence over unknown labels while other unknown Dates keep their slots among remaining Dates',()=>{
 const {sortYearDates}=require('./sorting');
 const input=parse('# History\n## Year\n### Unknown\n- A\n### Sun 20\n- B\n### Circa\n- C\n### Unclear\n- D\n### Sun 1\n- E');
 const output=sortYearDates(input,0,0,['Sun']);assert.deepEqual(output[0].years[0].groups.map(g=>g.title),['Circa','Unknown','Sun 1','Unclear','Sun 20']);
 const noMonths=sortYearDates(input,0,0,[]);assert.deepEqual(noMonths[0].years[0].groups.map(g=>g.title),['Circa','Unknown','Sun 20','Unclear','Sun 1']);
});
test('Date sorting protects the Starting Age and changes only the selected Year without merging Events',()=>{
 const {sortYearDates}=require('./sorting');
 const input=parse('# Start\n<!-- starting: true -->\n## Year\n### Sun 20\n- A\n### Circa\n- B\n\n---\n\n# History\n## Later\n### Sun 20\n- C\n### Circa\n- D\n## Earlier\n### Circa\n- E');
 assert.equal(sortYearDates(input,0,0,['Sun']),input);
 const output=sortYearDates(input,1,0,['Sun']);assert.equal(output[0],input[0]);assert.equal(output[1].years[1],input[1].years[1]);
 assert.deepEqual(output[1].years.map(y=>y.label),['Later','Earlier']);assert.equal(output[1].years[0].groups[1],input[1].years[0].groups[0]);
 assert.deepEqual(parse(serialize(output)),output);
});
