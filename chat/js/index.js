const Ws = require('ws').Server
;((Ws) => {
  // ws:localhost:8000
  const server = new Ws({
    port: 8000
  })
  const init = () => {
    bindEvent()
  }
  function bindEvent () {
    server.on('open', handleOpen)
    server.on('close', handleClose)
    server.on('error', handleError)
    server.on('connection', handleConnection)
  }

  function handleOpen (ws) {
    console.log('server open')
  }

  function handleClose (ws) {
    console.log('server close')
  }

  function handleError (ws) {
    console.log('server error')
  }

  function handleConnection (ws) {
    console.log('server connection')
    ws.on('message', handleMessag)
  }

  function handleMessag (msg) {
    console.log('msg', msg.toString())
    server.clients.forEach(c => {
      c.send(msg.toString())
    })
    console.log(server.clients)
  }
  init() 
})(Ws)
