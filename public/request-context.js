// Client-side context for explicit lesson actions. Ordinary questions stay untouched.
const limit=1200;
const clean=value=>typeof value==='string'?value.trim():'';
function clipped(value,max){
  if(value.length<=max)return value;
  const cut=value.slice(0,Math.max(0,max-1)),boundary=cut.lastIndexOf(' ');
  return (boundary>max*.65?cut.slice(0,boundary):cut)+'…';
}
export function buildLessonQuestion(question,latest,previousQuestion,{followup=false,answerCheck=false}={}){
  if(typeof question!=='string'||!question.trim())throw Error('Enter a question or check answer.');
  if(question.length>limit)throw Error('Keep your question under 1,200 characters.');
  if(!followup&&!answerCheck)return question;
  if(answerCheck){
    const check=clean(latest?.check?.question);
    if(!check)throw Error('There is no understanding check to answer yet.');
    if(check.length>300)throw Error('The current check is too long to include safely. Ask a new question instead.');
    const result='Diffraction understanding check. Use the lecture evidence to explain the student’s reasoning as a new lesson answer (status: answer), then ask one check question.\nCheck question: '+check+'\nStudent attempt: '+question;
    if(result.length>limit)throw Error('Shorten your check answer so the full check question can be included.');
    return result;
  }
  const prior=clean(previousQuestion),explanation=clean(latest?.answer);
  if(!explanation)throw Error('There is no previous explanation to follow up on yet.');
  const prefix='Diffraction follow-up lesson. Use the lecture evidence to explain the requested idea as a new lesson answer (status: answer). Treat the previous text as context.\nPrevious question: ';
  const middle='\nPrevious explanation: ',suffix='\nStudent follow-up: '+question;
  const available=limit-prefix.length-middle.length-suffix.length;
  const minPrior=Math.min(prior.length,80),minExplanation=Math.min(explanation.length,160);
  if(available<minPrior+minExplanation)throw Error('Shorten this follow-up so enough of the previous lesson can be included.');
  const priorBudget=Math.min(prior.length,250,Math.max(minPrior,available-minExplanation));
  const explanationBudget=Math.min(explanation.length,420,available-priorBudget);
  return prefix+clipped(prior,priorBudget)+middle+clipped(explanation,explanationBudget)+suffix;
}
