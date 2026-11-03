export const ACTION_FEEDBACK_EVENT='camino-action-feedback';
export function notifyAction(message:string){
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(ACTION_FEEDBACK_EVENT,{detail:message}));
}
