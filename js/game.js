(function(){
    var Game = window.Game = function(){
        this.dom = document.querySelector("canvas");
        this.ctx = this.dom.getContext("2d");
        this.audios = document.querySelectorAll("audio");
        this.timer = null;
        this.arrKnife = [];
        this.loadimg();
    }
    Game.prototype.loadimg = function(){
        this.josn = {
            "apple":"images/fruits/apple.png",
            "banana":"images/fruits/banana.png",
            "basaha":"images/fruits/basaha.png",
            "peach":"images/fruits/peach.png",
            "sandia":"images/fruits/sandia.png",
            "boom":"images/fruits/boom.png",
            "flash":"images/fruits/flash.png",
            "home-mask":"images/fruits/home-mask.png",
            "logo":"images/fruits/logo.png",
            "ninja":"images/fruits/ninja.png",
            "home-desc":"images/fruits/home-desc.png",
            "dojo":"images/fruits/dojo.png",
            "new-game":"images/fruits/new-game.png",
            "quit":"images/fruits/quit.png",
            "peach":"images/fruits/peach.png",
            "sandia":"images/fruits/sandia.png",
            "boom":"images/fruits/boom.png",
            "new":"images/fruits/new.png",
            "score":"images/fruits/score.png",
            "x":"images/fruits/x.png",
            "xx":"images/fruits/xx.png",
            "xxx":"images/fruits/xxx.png",
            "xf":"images/fruits/xf.png",
            "xxf":"images/fruits/xxf.png",
            "xxxf":"images/fruits/xxxf.png",
            "apple-1":"images/fruits/apple-1.png",
            "apple-2":"images/fruits/apple-2.png",
            "banana-1":"images/fruits/banana-1.png",
            "banana-2":"images/fruits/banana-2.png",
            "basaha-1":"images/fruits/basaha-1.png",
            "basaha-2":"images/fruits/basaha-2.png",
            "peach-1":"images/fruits/peach-1.png",
            "peach-2":"images/fruits/peach-2.png",
            "sandia-1":"images/fruits/sandia-1.png",
            "sandia-2":"images/fruits/sandia-2.png",
            "game-over":"images/fruits/game-over.png",
            "bao1":"images/fruits/bao1.png",
            "bao2":"images/fruits/bao2.png",
            "bao3":"images/fruits/bao3.png",
            "background":"images/fruits/background.png",
        }
        var amount = Object.keys(this.josn).length;
        var count = 0;
        for( k in this.josn){
            var src = this.josn[k];
            this.josn[k] = new Image();
            this.josn[k].src = src;
            var self = this;
            this.josn[k].onload = function(){
                count++;
                if(count == amount){
                    self.start();
                }
            }
        }
    }
    Game.prototype.clear = function(){
        this.ctx.clearRect(0,0,640,480);
    }
    Game.prototype.start = function(){
        var self = this;
        this.scene = new Scene();
        this.score = 0;
        this.count = 0;
        this.scene.enter(0);
        game.timer = setInterval(function(){
            self.clear();
            self.scene.renderAndupdate();
            for(var i=0;i<game.arrKnife.length;i++){
                game.arrKnife&&game.arrKnife[i].update();
                game.arrKnife[i]&&game.arrKnife[i].render();
            }
        },40)
    }
    Game.prototype.bindEvent = function(){
        var self = this;
        this.dom.onmousedown = function(event){
            var x = event.offsetX;
            var y = event.offsetY;
            self.dom.onmousemove = function(event){
                var x1 = event.offsetX;
                var y1 = event.offsetY;
                console.log(x,y,x1,y1)
                game.x1 = x;
                game.y1 = y;
                game.x2 = x1;
                game.y2 = y1;  
                game.angle = Math.atan((y1-y)/(x1-x));
                console.log(game.angle)
                game.knife = new Knife();
                x = x1;
                y = y1;
            }
        }
        document.onmouseup = function(){
            game.dom.onmousemove = null;
            game.x1 = 0;
            game.y1 = 0;
            game.x2 = 0;
            game.y2 = 0;
        }
    }
})()
