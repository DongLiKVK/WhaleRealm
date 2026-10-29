/* 主题首绘守卫（独立文件，不再内联）。
   为什么单独成文件：CSP 的 script-src 只有 'self' + 主站内联哈希，后台的哈希没在白名单里；
   与其为后台再往 CSP 里塞一条哈希（改一个字就失效，表现为夜间刷新闪白），
   不如让它成为一个同源脚本 —— 仍旧在 <link> 之前同步执行，首绘不会被推迟到样式之后。 */
/* 主题首绘守卫：在样式表之前决定 data-theme。
   为什么不用 CSS 的 prefers-color-scheme 直接了事：后台要记住管理员手动选的深浅色，
   而 localStorage 只能在脚本里读；这段必须放在 <link> 之前，否则夜间刷新会先画一帧白底。 */
(function(){
  try{
    var t = localStorage.getItem('whale-admin-theme');
    if(t === 'auto' || !t){
      t = matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
    }
    if(t !== 'day' && t !== 'night'){ t = 'day'; }
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = (t === 'night' ? 'dark' : 'light');
  }catch(e){}
})();
