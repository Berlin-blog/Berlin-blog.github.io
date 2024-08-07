var Game = function() {
  // 基本参数
  this.config = {
    isMobile: false,
    background: 0xcccccc, // 背景颜色
    ground: -1, // 地面y坐标
    fallingSpeed: 0.2, // 游戏失败掉落速度
    cubeColor: 0x2196f3,
    cubeWidth: 4, // 方块宽度
    cubeHeight: 2, // 方块高度
    cubeDeep: 4, // 方块深度
    jumperColor: 0x232323,
    jumperWidth: 1, // jumper宽度
    jumperHeight: 2, // jumper高度
    jumperDeep: 1, // jumper深度
  }
  // 游戏状态
  this.score = 0
  this.size = {
    width: window.innerWidth,
    height: window.innerHeight
  }
  this.scene = new THREE.Scene()
  this.cameraPos = {
    current: new THREE.Vector3(0, 0, 0), // 摄像机当前的坐标
    next: new THREE.Vector3() // 摄像机即将要移到的位置
  }
  this.camera = new THREE.OrthographicCamera(this.size.width / -40, this.size.width / 40, this.size.height / 40, this.size.height / -40, 0, 5000)
  this.renderer = new THREE.WebGLRenderer({
    antialias: true
  })

  this.cubes = [] // 方块数组
  this.cubeStat = {
    nextDir: '' // 下一个方块相对于当前方块的方向: 'left' 或 'right'
  }
  this.jumperStat = {
    ready: false, // 鼠标按完没有
    xSpeed: 0, // xSpeed根据鼠标按的时间进行赋值
    ySpeed: 0, // ySpeed根据鼠标按的时间进行赋值
    zSpeed: 0 //主角向中心偏移的速度
  }
  this.falledStat = {
    location: -1, // jumper所在的位置
    distance: 0 // jumper和最近方块的距离
  }
  this.fallingStat = {
    speed: 0.2, // 游戏失败后垂直方向上的掉落速度
    end: false // 掉到地面没有
  }
  this.cameraStat = {
    ready: false //摄像机视角切换是否完成
  }
  this.rank = document.getElementById("rank");
}
Game.prototype = {
  init: function() {
    this._checkUserAgent() // 检测是否移动端
    this._setCamera() // 设置摄像机位置
    this._setRenderer() // 设置渲染器参数
    this._setLight() // 设置光照
    this._createCube() // 加一个方块
    this._createCube() // 再加一个方块
    this._createJumper() // 加入游戏者jumper
    this._updateCamera() // 更新相机坐标

    var self = this
    var mouseEvents = (self.config.isMobile) ? {
      down: 'touchstart',
      up: 'touchend',
    } : {
      down: 'mousedown',
      up: 'mouseup',
    }
    // 事件绑定到canvas中
    var canvas = document.querySelector('canvas');

    canvas.addEventListener(mouseEvents.down, function() {
      self._handleMousedown()
    })
    // 监听鼠标松开的事件
    canvas.addEventListener(mouseEvents.up, function(evt) {
      var rotateTime = parseInt(self.jumperStat.ySpeed / 0.04);
      var rotateTimeNow = 0;
      self._handleMouseup(rotateTime, rotateTimeNow);
    })
    // 监听窗口变化的事件
    window.addEventListener('resize', function() {
      self._handleWindowResize()
    })
  },
  // 游戏失败重新开始的初始化配置
  restart: function() {
    this.score = 0
    this.cameraPos = {
      current: new THREE.Vector3(0, 0, 0),
      next: new THREE.Vector3()
    }
    this.fallingStat = {
      speed: 0.2,
      end: false
    }
    // 删除所有方块
    var length = this.cubes.length
    for (var i = 0; i < length; i++) {
      this.scene.remove(this.cubes.pop())
    }
    // 删除jumper
    this.scene.remove(this.jumper)
    // 显示的分数设为 0
    this.successCallback(this.score)
    this._createCube()
    this._createCube()
    this._createJumper()
    this._updateCamera()
  },
  // 游戏成功的执行函数, 外部传入
  addSuccessFn: function(fn) {
    this.successCallback = fn
  },
  // 游戏失败的执行函数, 外部传入
  addFailedFn: function(fn) {
    this.failedCallback = fn
  },
  // 检测是否手机端
  _checkUserAgent: function() {
    var n = navigator.userAgent;
    if (n.match(/Android/i) || n.match(/webOS/i) || n.match(/iPhone/i) || n.match(/iPad/i) || n.match(/iPod/i) || n.match(/BlackBerry/i)) {
      this.config.isMobile = true
    }
  },
  // THREE.js辅助工具
  _createHelpers: function() {
    var axesHelper = new THREE.AxesHelper(10)
    this.scene.add(axesHelper)
  },
  // 窗口缩放绑定的函数
  _handleWindowResize: function() {
    this._setSize()
    this.camera.left = this.size.width / -80
    this.camera.right = this.size.width / 80
    this.camera.top = this.size.height / 80
    this.camera.bottom = this.size.height / -80
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.size.width, this.size.height)
    this._render()
  },
  /**
   *鼠标按下或触摸开始绑定的函数
   *根据鼠标按下的时间来给 xSpeed 和 ySpeed 赋值
   *@return {Number} this.jumperStat.xSpeed 水平方向上的速度
   *@return {Number} this.jumperStat.ySpeed 垂直方向上的速度
   **/
  _handleMousedown: function() {
    var self = this
    if (!self.jumperStat.ready && self.jumper.scale.y > 0.03 && !self.cameraStat.ready) {
      self.jumper.scale.y -= 0.015
      self.jumperStat.xSpeed += 0.006
      self.jumperStat.ySpeed += 0.03
      self._render(self.scene, self.camera)
      this.rank.style.display = "none";
      requestAnimationFrame(function() {
        self._handleMousedown()
      })
    }
  },
  // 鼠标松开或触摸结束绑定的函数
  _handleMouseup: function(rotateTime, rotateTimeNow) {
    var self = this
    self.rotateTime = rotateTime;
    self.rotateTimeNow = rotateTimeNow + 1;
    // 标记鼠标已经松开
    self.jumperStat.ready = true;
    self.jumperStat.zSpeed = 0.024;
    // 判断jumper是在方块水平面之上，是的话说明需要继续运动
    if (self.jumper.position.y >= 1) {
      if (self.rotateTime >= 15) {
        // jumper根据下一个方块的位置来确定水平运动方向
        if (self.cubeStat.nextDir === 'left') {
          self.jumper.rotation['z'] = -rotateTimeNow * Math.PI / self.rotateTime; //旋转效果
          self.jumper.position.x -= self.jumperStat.xSpeed;
          //偏移之后向中心跳
          if (self.jumper.position.z >= self.cubes[self.cubes.length - 1].position.z + self.jumperStat.zSpeed) {
            self.jumper.position.z -= self.jumperStat.zSpeed;
          }
          if (self.jumper.position.z < self.cubes[self.cubes.length - 1].position.z - self.jumperStat.zSpeed) {
            self.jumper.position.z += self.jumperStat.zSpeed;
          }
        } else {

          self.jumper.rotation['x'] = -rotateTimeNow * Math.PI / self.rotateTime; //旋转效果
          self.jumper.position.z -= self.jumperStat.xSpeed;
          //偏移之后向中心跳
          if (self.jumper.position.x >= self.cubes[self.cubes.length - 1].position.x + self.jumperStat.zSpeed) {
            self.jumper.position.x -= self.jumperStat.zSpeed;
          }
          if (self.jumper.position.x < self.cubes[self.cubes.length - 1].position.x - self.jumperStat.zSpeed) {
            self.jumper.position.x += self.jumperStat.zSpeed;
          }
        }
      } else {
        // jumper根据下一个方块的位置来确定水平运动方向
        if (self.cubeStat.nextDir === 'left') {
          self.jumper.position.x -= self.jumperStat.xSpeed;
        } else {
          self.jumper.position.z -= self.jumperStat.xSpeed;
        }
      }
      // jumper在垂直方向上运动
      self.jumper.position.y += self.jumperStat.ySpeed
      //self.jumper.rotation['x'] = Math.sin(Math.PI * .25) * self.jumper.position.x + Math.cos(Math.PI * .25) * self.jumper.position.y;
      // 运动伴随着缩放
      if (self.jumper.scale.y < 1) {
        self.jumper.scale.y += 0.03
      }
      // jumper在垂直方向上先上升后下降
      self.jumperStat.ySpeed -= 0.04
      // 每一次的变化，渲染器都要重新渲染，才能看到渲染效果
      self._render(self.scene, self.camera)
      requestAnimationFrame(function() {
        self._handleMouseup(self.rotateTime, self.rotateTimeNow)
      });

    } else {
      // jumper掉落到方块水平位置，开始充值状态，并开始判断掉落是否成功
      self.jumperStat.ready = false
      self.jumperStat.xSpeed = 0
      self.jumperStat.ySpeed = 0
      self.jumper.position.y = 1
      self._checkInCube()
      if (self.falledStat.location === 1) {
        self.jumper.rotation['x'] = 2 * Math.PI;
        self.jumper.rotation['z'] = 2 * Math.PI;
        // 掉落成功，进入下一步
        self.score++
          self._createCube()
        self._updateCamera()

        if (self.successCallback) {
          self.successCallback(self.score)
        }
      } else {
        // 掉落失败，进入失败动画
        self._falling()
      }
    }
  },
  /**
   *游戏失败执行的碰撞效果
   *@param {String} dir 传入一个参数用于控制倒下的方向：'rightTop','rightBottom','leftTop','leftBottom','none'
   **/
  _fallingRotate: function(dir) {
    var self = this
    var offset = self.falledStat.distance - self.config.cubeWidth / 2
    var rotateAxis = 'z' // 旋转轴
    var rotateAdd = self.jumper.rotation[rotateAxis] + 0.1 // 旋转速度
    var rotateTo = self.jumper.rotation[rotateAxis] < Math.PI / 2 // 旋转结束的弧度
    var fallingTo = self.config.ground + self.config.jumperWidth / 2 + offset
    self.cameraStat.ready = false;
    if (dir === 'rightTop') {
      rotateAxis = 'x'
      rotateAdd = self.jumper.rotation[rotateAxis] - 0.1
      rotateTo = self.jumper.rotation[rotateAxis] > -Math.PI / 2
      self.jumper.translate.z = offset
    } else if (dir === 'rightBottom') {
      rotateAxis = 'x'
      rotateAdd = self.jumper.rotation[rotateAxis] + 0.1
      rotateTo = self.jumper.rotation[rotateAxis] < Math.PI / 2
      self.jumper.translate.z = -offset
    } else if (dir === 'leftBottom') {
      rotateAxis = 'z'
      rotateAdd = self.jumper.rotation[rotateAxis] - 0.1
      rotateTo = self.jumper.rotation[rotateAxis] > -Math.PI / 2
      self.jumper.translate.x = -offset
    } else if (dir === 'leftTop') {
      rotateAxis = 'z'
      rotateAdd = self.jumper.rotation[rotateAxis] + 0.1
      rotateTo = self.jumper.rotation[rotateAxis] < Math.PI / 2
      self.jumper.translate.x = offset
    } else if (dir === 'none') {
      rotateTo = false
      fallingTo = self.config.ground
    } else {
      throw Error('Arguments Error')
    }
    if (!self.fallingStat.end) {
      if (rotateTo) {
        self.jumper.rotation[rotateAxis] = rotateAdd
      } else if (self.jumper.position.y > fallingTo) {
        self.jumper.position.y -= self.config.fallingSpeed
      } else {
        self.fallingStat.end = true
      }
      self._render()
      requestAnimationFrame(function() {
        self._falling()
      })
    } else {
      if (self.failedCallback) {
        self.failedCallback()
      }
    }
  },
  /**
   *游戏失败进入掉落阶段
   *通过确定掉落的位置来确定掉落效果
   **/
  _falling: function() {
    var self = this;
    if (self.falledStat.location == 0) {
      self._fallingRotate('none')
    } else if (self.falledStat.location === -10) {
      if (self.cubeStat.nextDir == 'left') {
        self._fallingRotate('leftTop')
      } else {
        self._fallingRotate('rightTop')
      }
    } else if (self.falledStat.location === 10) {
      if (self.cubeStat.nextDir == 'left') {
        if (self.jumper.position.x < self.cubes[self.cubes.length - 1].position.x) {
          self._fallingRotate('leftTop')
        } else {
          self._fallingRotate('leftBottom')
        }
      } else {
        if (self.jumper.position.z < self.cubes[self.cubes.length - 1].position.z) {
          self._fallingRotate('rightTop')
        } else {
          self._fallingRotate('rightBottom')
        }
      }
    }
  },
  /**
   *判断jumper的掉落位置
   *@return {Number} this.falledStat.location
   * -1 : 掉落在原来的方块，游戏继续
   * -10: 掉落在原来方块的边缘，游戏失败
   *  1 : 掉落在下一个方块，游戏成功，游戏继续
   *  10: 掉落在下一个方块的边缘，游戏失败
   *  0 : 掉落在空白区域，游戏失败
   **/
  _checkInCube: function() {
    if (this.cubes.length > 1) {
      // jumper 的位置
      var pointO = {
        x: this.jumper.position.x,
        z: this.jumper.position.z
      }
      // 当前方块的位置
      var pointA = {
        x: this.cubes[this.cubes.length - 1 - 1].position.x,
        z: this.cubes[this.cubes.length - 1 - 1].position.z
      }
      // 下一个方块的位置
      var pointB = {
        x: this.cubes[this.cubes.length - 1].position.x,
        z: this.cubes[this.cubes.length - 1].position.z
      }
      var distanceS, // jumper和当前方块的坐标轴距离
        distanceL // jumper和下一个方块的坐标轴距离
      // 判断下一个方块相对当前方块的方向来确定计算距离的坐标轴
      if (this.cubeStat.nextDir === 'left') {
        distanceS = Math.abs(pointO.x - pointA.x)
        distanceL = Math.abs(pointO.x - pointB.x)
      } else {
        distanceS = Math.abs(pointO.z - pointA.z)
        distanceL = Math.abs(pointO.z - pointB.z)
      }
      var should = this.config.cubeWidth / 2 + this.config.jumperWidth / 2
      var result = 0
      if (distanceS < should) {
        // 落在当前方块，将距离储存起来，并继续判断是否可以站稳
        this.falledStat.distance = distanceS
        result = distanceS < this.config.cubeWidth / 2 ? -1 : -10
      } else if (distanceL < should) {
        this.falledStat.distance = distanceL
        // 落在下一个方块，将距离储存起来，并继续判断是否可以站稳
        result = distanceL < this.config.cubeWidth / 2 ? 1 : 10
      } else {
        result = 0
      }
      this.falledStat.location = result
    }
  },
  // 每成功一步, 重新计算摄像机的位置，保证游戏始终在画布中间进行
  _updateCameraPos: function() {
    var lastIndex = this.cubes.length - 1
    var pointA = {
      x: this.cubes[lastIndex].position.x,
      z: this.cubes[lastIndex].position.z
    }
    var pointB = {
      x: this.cubes[lastIndex - 1].position.x,
      z: this.cubes[lastIndex - 1].position.z
    }
    var pointR = new THREE.Vector3()
    pointR.x = (pointA.x + pointB.x) / 2
    pointR.y = 0
    pointR.z = (pointA.z + pointB.z) / 2
    this.cameraPos.next = pointR
  },
  // 基于更新后的摄像机位置，重新设置摄像机坐标
  _updateCamera: function() {
    var self = this;
    self.cameraStat.ready = true;
    var c = {
      x: self.cameraPos.current.x,
      y: self.cameraPos.current.y,
      z: self.cameraPos.current.z
    }
    var n = {
      x: self.cameraPos.next.x,
      y: self.cameraPos.next.y,
      z: self.cameraPos.next.z
    }
    if (c.x > n.x || c.z > n.z) {
      self.cameraPos.current.x -= 0.15
      self.cameraPos.current.z -= 0.15
      if (self.cameraPos.current.x - self.cameraPos.next.x < 0.05) {
        self.cameraPos.current.x = self.cameraPos.next.x
      }
      if (self.cameraPos.current.z - self.cameraPos.next.z < 0.05) {
        self.cameraPos.current.z = self.cameraPos.next.z
      }
      self.camera.lookAt(new THREE.Vector3(c.x, 0, c.z))
      self._render()
      requestAnimationFrame(function() {
        self._updateCamera()
      })
    } else {
      self.cameraStat.ready = false;
    }
  },
  merge: function(e) {
    for (var t = {}, i = 0; i < e.length; i++) {
      var n = this.clone(e[i]);
      for (var r in n) t[r] = n[r]
    }
    return t
  },
  // 初始化jumper：游戏主角
  _createJumper: function() {
    var r = THREE;
    var texloader = new THREE.TextureLoader();
    var t = new r.MeshBasicMaterial({
      //map: texloader.load("res/head.png")
      color: 0x000000
    });
    this.obj = new r.Object3D, this.obj.name = "jumper", this.trail = null, this.jumper = new r.Object3D;
    this.human = new r.Object3D, this.head = new r.Mesh(new r.SphereGeometry(1 * .45, 20, 20), t), this.head.castShadow = !0, this.bottom = new r.Mesh(new r.CylinderGeometry(.4158, .60007, 1 * .45 * 2.68, 20), new r.MeshBasicMaterial({
      //map: texloader.load("res/bottom.png")
      color: 0x000000
    })), this.bottom.rotation.y = 4.7, this.bottom.castShadow = !0;
    var i = new r.CylinderGeometry(1 * .45, .4158, 1 * .45 * 1.2, 20),
      n = [new r.MeshBasicMaterial({
        //map: texloader.load("res/top.png")
        color: 0x000000
      }), t],
      a = new r.Geometry;
    i.rotateY(4.7), this.merge(a, i, 0, [{
      x: 0,
      y: this.bottom.position.y + 1 * .45 * 1.94,
      z: 0
    }]);
    var h = new r.SphereGeometry(1 * .45, 20, 20);
    h.scale(1, .54, 1), this.merge(a, h, 1, [{
      x: 0,
      y: this.bottom.position.y + 1.2001,
      z: 0
    }]);
    this.middle = new r.Mesh(i, n);
    this.middle.position.y = .8
    this.middle.castShadow = !0;
    this.body = new r.Object3D;
    this.body.add(this.bottom);
    this.body.add(this.middle);
    this.human.add(this.body);
    this.human.position.y = 1;
    this.head.position.y = 2.364;
    this.human.add(this.head);
    this.jumper.add(this.human);
    this.jumper.position.y = 1;
    this.jumper.castShadow = true;
    //this.bottle.position.y = o.BOTTLE.bodyHeight / 2 - .25;
    //this.obj.add(this.jumper);
    /*this.status = "stop";
    this.scale = 1;
    this.double = 1;
    this.velocity = {};
    this.flyingTime = 0;
    this.direction = "straight";
    this.jumpStatus = "init", this.particles = [];*/
    this.scene.add(this.jumper);
  },
  // 新增一个方块, 新的方块有2个随机方向
  _createCube: function() {
    var material = new THREE.MeshLambertMaterial({
      color: this.config.cubeColor
    })
    var geometry = new THREE.CubeGeometry(this.config.cubeWidth, this.config.cubeHeight, this.config.cubeDeep)
    var mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (this.cubes.length) {
      var random = Math.random()
      this.cubeStat.nextDir = random > 0.5 ? 'left' : 'right'
      mesh.position.x = this.cubes[this.cubes.length - 1].position.x
      mesh.position.y = this.cubes[this.cubes.length - 1].position.y
      mesh.position.z = this.cubes[this.cubes.length - 1].position.z
      if (this.cubeStat.nextDir === 'left') {
        mesh.position.x = this.cubes[this.cubes.length - 1].position.x - 4 * Math.random() - 6
      } else {
        mesh.position.z = this.cubes[this.cubes.length - 1].position.z - 4 * Math.random() - 6
      }
    }
    this.cubes.push(mesh)
    // 当方块数大于6时，删除前面的方块，因为不会出现在画布中
    if (this.cubes.length > 6) {
      this.scene.remove(this.cubes.shift())
    }

    this.scene.add(mesh)
    // 每新增一个方块，重新计算摄像机坐标
    if (this.cubes.length > 1) {
      this._updateCameraPos()
    }
  },
  _render: function() {
    this.renderer.render(this.scene, this.camera)
  },
  _setLight: function() {
    var ambientLight = new THREE.AmbientLight(0xffffff, .8); // 环境光颜色
    this.scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, .28);
    //directionalLight.position.set(75, 120, -100);
    directionalLight.position.set(25, 40, -10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;
    directionalLight.shadow.mapSize.width = directionalLight.shadow.mapSize.height = 1024 * 4; //阴影分辨率
    this.scene.add(directionalLight)

    /*var light = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(light)*/


    /*var spotLight = new THREE.SpotLight(0xffffff);
    spotLight.position.set(20, 40, -10); //SpotLight()方法从它的位置（spotLight.position.set( -40, 60, -10 )）照亮我们的场景
    spotLight.castShadow = true; //要定义哪些光源会产生阴影。使用的SpotLight()可以产生影子。设置正确的属性，阴影最终就会被渲染出来。
    spotLight.shadowMapWidth = spotLight.shadowMapHeight = 1024 * 2;
    this.scene.add(spotLight);*/

  },
  _setCamera: function() {
    this.camera.position.set(100, 100, 100)
    this.camera.lookAt(this.cameraPos.current)
  },
  _setRenderer: function() {
    this.renderer.setSize(this.size.width, this.size.height)
    this.renderer.setClearColor(this.config.background)
    this.renderer.shadowMap.enabled = true; //开启阴影
    //this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.precision = 'highp'; //着色精度选择
    if (document.body.clientWidth < 767) {
      this.renderer.setPixelRatio(window.devicePixelRatio < 2 ? window.devicePixelRatio : 2); //防止在移动端浏览器模糊
    }
    document.body.appendChild(this.renderer.domElement)
    //添加平面, 绘制阴影
    var planeGeometry = new THREE.PlaneGeometry(this.size.width, this.size.height, 2, 2);
    var planeMaterial = new THREE.MeshLambertMaterial({
      color: 0xc1c5ce
    });
    var plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.receiveShadow = true;
    plane.rotation.x = -0.5 * Math.PI;
    plane.position.x = 0
    plane.position.y = -1.1
    plane.position.z = 0
    this.scene.add(plane);

  },
  _setSize: function() {
    this.size.width = window.innerWidth,
      this.size.height = window.innerHeight
  }
}
