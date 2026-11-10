window.StaffAPI = async function(path, data) {
 const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(25000)});
 if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('Sign in on Manage scraper to continue.');
 const result=await response.json();if(!response.ok)throw Error(result.error||'The request could not be completed.');return result;
};
