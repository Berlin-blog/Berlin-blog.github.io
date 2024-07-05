((doc, location) => {
  const useName = doc.querySelector('#userName')
  const passWord = doc.querySelector('#passWord')
  const btn = doc.querySelector('#btn')

  const init = () => {
    bindEvent()
  }

  function bindEvent() {
    btn.addEventListener('click', handClick, false)
  }

  function handClick () {
    // 输入用户名密码
   console.log('useName', useName, useName.value)
   console.log('passWord',passWord, passWord.value )
  //  跳转至聊天室
   if ( useName.value && passWord.value) {
    location.href = 'index.html?useName='+ useName.value + '&passWord='+ passWord.value
   }
  }
  init ()
})(document, location)

