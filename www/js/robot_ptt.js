function RobotPtt(bbsCore) {
  this.bbsCore = bbsCore;
  this.strParser = new StringParserPtt();
  this.prefs = bbsCore.prefs;
  //this.replyCount = [];
  this.autoLoginStage = 0;
  this.postLoginStage = 0;
  this.taskStage = 0;
  this.timerInterval = 40;
  //this.downloadArticle = new DownloadArticle(bbsCore);

  //termStatus: 0 //main list
  //termStatus: 1 //favorite list
  //termStatus: 2 //article list
  //termStatus: 3 //reading article
  this.termStatus = 0;
  this.currentTask = 0; //1:getFavoriteList, 2:logout, 3:getBoardList, 4:getArticleList 5:enterBoard 6:getArticleContent
  this.taskList = [];

  this.favoriteList = [];
  this.flMap = {};
  this.alMap = {};
  this.highlightCount = 0;
  this.highlightList = [];
  this.articleData = {};
}

RobotPtt.prototype={
  taskDefines: {
    none: 0,
    getFavoriteList: 1,
    logout: 2,
    getBoardList: 3,
    getArticleList: 4,
    enterBoard: 5,
    getArticleContent: 6    
  },
  // Modified from pcmanx-gtk2
  initialAutoLogin: function() {
    if(this.prefs.loginStr[1])
      this.autoLoginStage = this.prefs.loginStr[0] ? 1 : 2;
    else if(this.prefs.loginStr[2])
      this.autoLoginStage = 3;
    else
      this.autoLoginStage = 0;
  },

  // Modified from pcmanx-gtk2
  checkAutoLogin: function(row) {
    if(this.autoLoginStage > 3 || this.autoLoginStage < 1) {
      this.autoLoginStage = 0;
      return;
    }

    var line = this.bbsCore.buf.getRowText(row, 0, this.bbsCore.buf.cols);
    if(line.indexOf(this.prefs.loginPrompt[this.autoLoginStage - 1]) < 0)
      return;

    var Encoding = this.prefs.charset;
    var EnterKey = this.prefs.EnterChar;
    //this.send(this.convSend(this.prefs.loginStr[this.autoLoginStage-1] + this.prefs.EnterChar, Encoding, true));
    this.bbsCore.conn.convSend(this.prefs.loginStr[this.autoLoginStage - 1] + EnterKey, Encoding);

    if(this.autoLoginStage == 3) {
      //if(this.prefs.loginStr[3])
      //  this.bbsCore.conn.convSend(this.prefs.loginStr[3], Encoding);
      this.autoLoginStage = 0;
      this.postLoginStage = 1;
      //check deleteDuplicate
      setTimeout(this.checkLoginStatus.bind(this), this.timerInterval);
      return;
    }
    ++this.autoLoginStage;
  },


  checkLoginStatus: function() {

    var Encoding = this.prefs.charset;
    var EnterKey = this.prefs.EnterChar;
    var line0 = this.bbsCore.buf.getRowText(21, 0, this.bbsCore.buf.cols);
    var line1 = this.bbsCore.buf.getRowText(22, 0, this.bbsCore.buf.cols);
    var line2 = this.bbsCore.buf.getRowText(23, 0, this.bbsCore.buf.cols);
    var line3 = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);

    //TODO: Remove these chinese, replace by escape encoding.
    if(this.postLoginStage == 1  && this.strParser.getErrorLogin(line0)) {
      var task = this.taskList.shift();
      task.callback('login-failed', 'Login error'); //keep error login message.
      this.taskList = []; //empty all task
      return;
    } else if(this.postLoginStage == 1  && this.strParser.getDuplicatedLogin(line1)) {
      this.postLoginStage = 2;
      if(this.prefs.deleteDuplicate) {
        this.bbsCore.conn.convSend('y' + EnterKey, Encoding);
      } else {
        this.bbsCore.conn.convSend('n' + EnterKey, Encoding);
      }
    } else if((this.postLoginStage == 1 || this.postLoginStage == 2) && this.strParser.getPressAnyKeyText(line2) ) {
      this.postLoginStage = 3;
      this.bbsCore.conn.send(' ');
    } else if(this.postLoginStage == 3 && this.strParser.getErrorLoginLogs(line2)) {
      this.postLoginStage = 4;
      this.bbsCore.conn.convSend('y' + EnterKey, Encoding);
    } else if((this.postLoginStage == 3 || this.postLoginStage == 4) && this.strParser.getMainFunctionList(line3)) {
      console.log('main menu');
      this.bbsCore.conn.debug = true;
      this.termStatus = 0;
      this.postLoginStage = 0;
      var task = this.taskList.shift();
      task.callback('login-success'); //keep error login message.
      this.runNextTask();
      return;
    }
    setTimeout(this.checkLoginStatus.bind(this), this.timerInterval);
  },

  checkTask: function() {
    if(this.taskStage == 0)
      return;
    this.taskList[0].run();
  },

  addTask: function(task, force) {
    if(!force) { //if force== false, check exists.
      var count = this.taskList.length;
      for(var i=0;i<count;++i) {
        if(this.taskList[i].name == task.name) {
          return;
        }
      }
    }
    this.taskList.push(task);
    if(this.currentTask == this.taskDefines.none)
      this.runNextTask();
  },

  runNextTask: function() {
    if(this.taskList.length > 0)
      this.taskList[0].run();
  },
  
  removeAllTask: function() {
    this.taskList = [];
  },

  getFavoriteListFromMap: function() {
    var favoriteList = [];
    for(var i=1;i<65535;++i) {
      if(this.flMap['b' + i]) {
        favoriteList.push(this.flMap['b' + i]);
      } else {
        break;
      }
    }
    return favoriteList;
  },

  getArticleListFromMap: function(alMap, min, max) {
    var articleList = [];
    for(var i=min;;++i) {
      if(max && i>=max)
        break;
      if(alMap['a' + i]) {
        articleList.push(alMap['a' + i]);
      } else {
        break;
      }
    }
    return articleList;
  },
  
  getFavoriteList: function() {
    //TODO: detect if favorite list empty
    this.currentTask = this.taskDefines.getFavoriteList;
    if(this.taskStage == 0) {
      this.flMap = {};
      this.taskStage = 1;
      if(this.termStatus != 0) {
        this.bbsCore.conn.send('\x1b[D\x1b[D\x1b[D');
      }
      this.bbsCore.conn.send('f' + this.prefs.EnterChar + '\x1b[4~'); //f + enter + end -> show last item.
    } else if(this.taskStage == 1) {
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      var firstBoardP1 = this.bbsCore.buf.getRowText(3, 0, 63);
      var firstBoardP2 = this.bbsCore.buf.getRowText(3, 64, 67);
      var firstBoardData = this.strParser.parseBoardData(firstBoardP1, firstBoardP2);
      if(this.strParser.getBoardList(line) && firstBoardData) {
        this.termStatus = 1;
        //console.log('this.bbsCore.buf.cur_x = ' + this.bbsCore.buf.cur_x);
        for(var i=3;i<23;++i) {
          var boardP1 = this.bbsCore.buf.getRowText(i, 0, 63);
          var boardP2 = this.bbsCore.buf.getRowText(i, 64, 67);
          var boardData = this.strParser.parseBoardData(boardP1, boardP2);
          if(boardData) {
            this.flMap['b'+boardData.sn] = boardData;
          }
        }
        if(this.flMap['b1']) {
          var favoriteList = this.getFavoriteListFromMap();
          this.taskStage = 0;
          var task = this.taskList.shift();
          task.callback(favoriteList);
          this.currentTask = this.taskDefines.none;
          this.runNextTask();
          return;          
        }
        this.taskStage = 2;
        this.bbsCore.conn.send('\x1b[5~'); //page up.
      }
    }
    else if(this.taskStage == 2) {
      var firstBoardP1 = this.bbsCore.buf.getRowText(3, 0, 63);
      var firstBoardP2 = this.bbsCore.buf.getRowText(3, 64, 67);
      var firstBoardData = this.strParser.parseBoardData(firstBoardP1, firstBoardP2);
      if(firstBoardData) {
        for(var i=3;i<23;++i) {
          var boardP1 = this.bbsCore.buf.getRowText(i, 0, 63);
          var boardP2 = this.bbsCore.buf.getRowText(i, 64, 67);
          var boardData = this.strParser.parseBoardData(boardP1, boardP2);
          if(boardData && !this.flMap['b'+boardData.sn]) {
              this.flMap['b'+boardData.sn] = boardData;
          }
        }
        if(this.flMap['b1']) {
          var favoriteList = this.getFavoriteListFromMap();
          this.taskStage = 0;
          var task = this.taskList.shift();
          task.callback(favoriteList);
          this.currentTask = this.taskDefines.none;
          this.runNextTask();
          return;
        }
        this.bbsCore.conn.send('\x1b[5~'); //page up.
      }      
    }
    setTimeout(this.getFavoriteList.bind(this), this.timerInterval);
  },
  
  enterBoard: function() {
    this.currentTask = this.taskDefines.enterBoard;
    var extData = this.taskList[0].extData;
    var EnterChar = this.prefs.EnterChar;
    if(this.taskStage == 0) {
      this.taskStage = 1;
      if(this.termStatus != 1) {
        //TODO: we need a command that can jump into board from any where.
        //this command can't use when reading article
        //this.bbsCore.conn.send('s' + String(extData.boardName) +  EnterChar + ' ' + '\x1b[4~\x1b[4~');//s,boardName,enter,space,end,end
        
        //NOTE: only wen board in your favorite list.        
        this.bbsCore.conn.send('\x1af' + String(extData.sn) +  EnterChar + EnterChar + ' ' + '\x1b[4~');//ctrl+z,f        
      } else {
        this.bbsCore.conn.send(String(extData.sn) +  EnterChar + EnterChar + ' ' + '\x1b[4~');
      }
    } else if(this.taskStage == 1) {
      // check board name.
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      if( this.strParser.getBoardHeader(line, extData.boardName)) {
          this.taskStage = 0;
          this.termStatus = 2;
          var task = this.taskList.shift();
          task.callback();
          this.currentTask = this.taskDefines.none;
          this.runNextTask();
          return;
      }
    }
    setTimeout(this.enterBoard.bind(this), this.timerInterval);
  },

  fixArticleSN: function(alMap, min, max) {
    while( max-min > 10000) {
      var tmpData = alMap['a'+min];
      tmpData.sn += 100000;
      delete alMap['a'+min];
      alMap['a'+tmpData.sn] = tmpData;
      min = tmpData.sn; //fine min again
      for (var key in alMap) {
        if (alMap.hasOwnProperty(key)) {
          if(alMap[key].sn < min)
            min = alMap[key].sn;
        }
      }
    }
    return min;
  },
  
  getArticleList: function() {
    this.currentTask = this.taskDefines.getArticleList;
    var extData = this.taskList[0].extData;
    //none: end, get first page
    //new: left + enter + end, get all article that sn > max
    //old: jump to min, get article that sn < min (articleList.length = 15)
    var EnterChar = this.prefs.EnterChar;
    if(this.taskStage == 0) {
      this.alMap = {};
      if(this.termStatus != 2) {
        //error ?
        alert('error ?');
      }
      if(extData.direction == 'none') {
        this.highlightCount = 0;
        this.taskStage = 2;
      } else if(extData.direction == 'new') {
        this.taskStage = 1;
        this.bbsCore.conn.send('\x1b[D' + EnterChar + '\x1b[4~');//left + enter + end
      } else if(extData.direction == 'old') {
        this.taskStage = 2;
        this.bbsCore.conn.send(String(extData.min) + EnterChar );//jump to article ns = min
      }
    } else if(this.taskStage == 1) {
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);    
      if(this.strParser.getBoardHeader(line, extData.boardName)) {
        this.taskStage = 2;
        this.termStatus = 2;
      }
    } else if(this.taskStage == 2) {
      // check board name.
      var firstArticleP1 = this.bbsCore.buf.getRowText(3, 0, 30);
      var firstArticleP2 = this.bbsCore.buf.getRowText(3, 30, this.bbsCore.buf.cols);
      var firstArticleData = this.strParser.parseArticleData(firstArticleP1, firstArticleP2);
      if(firstArticleData) {
        //var alMap = {};
        var max = 0;
        var min = 0;

        for(var i=3;i<23;++i) {
          var articleP1 = this.bbsCore.buf.getRowText(i, 0, 30);
          var articleP2 = this.bbsCore.buf.getRowText(i, 30, this.bbsCore.buf.cols);
          var articleData = this.strParser.parseArticleData(articleP1, articleP2);
          if(articleData && articleData.sn!=0 && !this.alMap['a'+articleData.sn]) {
            if(max==0 && min==0) {
              max = articleData.sn;
              min = articleData.sn;
            }
            if(articleData.sn > max)
              max = articleData.sn;
            if(articleData.sn < min)
              min = articleData.sn;
            this.alMap['a'+articleData.sn] = articleData;
          } else if(articleData && articleData.sn == 0) {
            //highlight list
            if(extData.direction == 'none') {
              this.highlightCount++;
              this.highlightList.push(articleData);
            }
          }
        }
        min = this.fixArticleSN(this.alMap, min, max);
        if(extData.direction == 'none') {
          var articleList = this.getArticleListFromMap(this.alMap, min);
          articleList.reverse();
          this.termStatus = 2;
          if(this.highlightCount > 0) {
            //callback to update articleList and crawl hightlight list.
            this.highlightList = this.highlightList.reverse();
            task = this.taskList[0];
            task.callback(articleList);
            this.taskStage = 4;
            var upStr = '';
            for(var i=0;i<this.highlightCount-1;++i) {
              upStr+='\x1b[A';
            }
            this.bbsCore.conn.send('\x1b[4~\x1b[4~' + upStr + EnterChar); //end, up * n-1, enter 
          } else {
            this.taskStage = 0;
            var task = this.taskList.shift();
            task.callback(articleList);
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
          }
        } else if(extData.direction == 'new') {
          //if(!this.alMap['a'+extData.max]) {  //only crawl newest data
          if(!this.alMap['a'+extData.min]) { //crawl all data to update article's newest status
            this.taskStage = 3;
            //send page up and wait update. how to detect page up finish?
            this.bbsCore.conn.send('\x1b[B\x1b[5~');//arrow down + page up
          } else {
            this.taskStage = 0;
            this.termStatus = 2;
            var tmparr = [];
            for (var key in this.alMap) {
              if (this.alMap.hasOwnProperty(key)) {
                tmparr.push(key);
              }
            }
            var articleList = this.getArticleListFromMap(this.alMap, parseInt(extData.max)+1);
            var updateList = this.getArticleListFromMap(this.alMap, parseInt(extData.min), parseInt(extData.max)+1);
            articleList.reverse();
            updateList.reverse();
            //console.log('updateList.length = ' + updateList.length);
            var task = this.taskList.shift();
            task.callback(articleList, {updateList: updateList,
                                        updateFields: ['author','popular','aClass','title','level']
                                       });
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
          }
        } else if(extData.direction == 'old') {
          //we can't end task if this.alMap.length < extData.count (default 15)
          var articleList = this.getArticleListFromMap(this.alMap, min, extData.min);
          if(articleList.length < extData.count && !this.alMap['a1']) {
            this.taskStage = 3;
            //send page up and wait update. how to detect page up finish?
            this.bbsCore.conn.send('\x1b[B\x1b[5~');//arrow down + page up
          } else {
            this.taskStage = 0;
            this.termStatus = 2;
            var articleList = this.getArticleListFromMap(this.alMap, min, extData.min);
            articleList.reverse();
            var task = this.taskList.shift();
            task.callback(articleList);
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
          }
        }
      }
    } else if(this.taskStage == 3) {
      //detect and switch to stage 2
      var line = this.bbsCore.buf.getRowText(3, 0, 2);
      if(line=='\u25cf') { //solid circle
        this.taskStage = 2;
      }
    } else if(this.taskStage == 4) {
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      var articleHeaderData = this.strParser.parseArticleHeader(line);
      if(articleHeaderData) {
        this.taskStage = 5;
        this.bbsCore.conn.send('Q'); //shift+q 
      } 
    } else if(this.taskStage == 5) {
      var line = this.bbsCore.buf.getRowText(19, 0, this.bbsCore.buf.cols);
      var aidData = this.strParser.parseAid(line);
      if(aidData) {
        this.highlightCount--;
        this.highlightList[this.highlightCount].aid = aidData.aid; 
        if(this.highlightCount == 0) {
          //console.log('finsih all');
          this.taskStage = 0;
          this.bbsCore.conn.send('\x1b[D');
          var task = this.taskList.shift();
          task.callback([],{highlightList: this.highlightList});
          this.highlightList = [];
          this.currentTask = this.taskDefines.none;
          this.runNextTask();
          return;
        } else {
          this.taskStage = 4;
          var upStr = '';
          for(var i=0;i<this.highlightCount-1;++i) {
            upStr+='\x1b[A';
          }
          this.bbsCore.conn.send('\x1b[D\x1b[4~\x1b[4~' + upStr + EnterChar); //left,end,end,up*n,enter
        }
        //parseArticleHeader
      }
    }
    
    setTimeout(this.getArticleList.bind(this), this.timerInterval);
  },

  getArticleContent: function() {
    this.currentTask = this.taskDefines.getArticleContent;
    var extData = this.taskList[0].extData;
    var EnterChar = this.prefs.EnterChar;
    if(this.taskStage == 0) {
      this.articleData = {
        currentPage: 1,
        totalPage: 0,
        currentLine: 0,
        finish: false,
        lines: []
      };
      if(this.termStatus != 2) {
      }
      if(extData.article.aid) { //have aid, user aid to jump to article
        this.taskStage = 3;
        this.bbsCore.conn.send('#' + extData.article.aid + EnterChar + EnterChar);//left + enter + end
      } else { //no aid, user sn to jump to article, then crawl aid.
        this.taskStage = 1;
        this.bbsCore.conn.send(extData.article.sn + EnterChar + EnterChar);
      }
    } else if(this.taskStage == 1) {      
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      console.log(line);
      var articleHeaderData = this.strParser.parseArticleHeader(line);
      if(articleHeaderData) {
        this.termStatus = 3;
        this.taskStage = 2;
        this.bbsCore.conn.send('Q'); //shift+q 
      } 
    } else if(this.taskStage == 2) {
      var line = this.bbsCore.buf.getRowText(19, 0, this.bbsCore.buf.cols);
      var aidData = this.strParser.parseAid(line);
      if(aidData) {
        extData.article.aid = aidData.aid;
        this.taskStage = 3;
        this.bbsCore.conn.send(' ' + EnterChar); //space,enter
      }
    } else if(this.taskStage == 3) {
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      var articleHeaderData = this.strParser.parseArticleHeader(line);
      if(articleHeaderData) {
        var statusText = this.bbsCore.buf.getRowText(23, 0, this.bbsCore.buf.cols);
        if(this.strParser.getContentAlertMessage(statusText)) {
          if(this.strParser.getLastPage(statusText)) {
            //only one page, crawl this page and exit
            for(var i=22;i>=0;--i) {
              var content = this.bbsCore.buf.getRowText(i, 0, this.bbsCore.buf.cols); //need parse to html tag.
              if(content.replace(/^\s+|\s+$/g,'') !== '' && !this.articleData.finish) {
                this.articleData.finish = true;
                this.articleData.lines.unshift(content);
              } else if(this.articleData.finish) {
                this.articleData.lines.unshift(content);
              }
            }
            this.articleData.currentPage = 1;
            this.articleData.totalPage = 1;
            this.currentLine = this.articleData.lines.length;
            this.taskStage = 0;
            this.termStatus = 2;
            this.bbsCore.conn.send('\x1b[D'); //left
            var task = this.taskList.shift();
            task.callback(this.articleData);
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
          } else {
            this.taskStage = 5;
            this.bbsCore.conn.send('\x1b[B'); //arrow down
          }
        }
        var statusInfo = this.strParser.parseArticleStatus(statusText);
        if(statusInfo) {
          if(statusInfo.pagePercent == 100) {
            //only one page, crawl this page and exit
            for(var i=22;i>=0;--i) {
              var content = this.bbsCore.buf.getRowText(i, 0, this.bbsCore.buf.cols); //need parse to html tag.
              if(content.replace(/^\s+|\s+$/g,'') !== '' && !this.articleData.finish) {
                this.articleData.finish = true;
                this.articleData.lines.unshift(content);
              } else if(this.articleData.finish) {
                this.articleData.lines.unshift(content);
              }
            }
            this.articleData.currentPage = 1;
            this.articleData.totalPage = 1;
            this.currentLine = this.articleData.lines.length;
            this.taskStage = 0;
            this.termStatus = 2;
            this.bbsCore.conn.send('\x1b[D'); //left
            var task = this.taskList.shift();
            task.callback(this.articleData);
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
            //
          } else {
            if(statusInfo.pageTotal == 0) {
              this.taskStage = 7;
              this.bbsCore.conn.send('\x1b[4~'); //end
            } else {
              //get all info. crawl first data
              //
              for(var i=0;i<23;++i) {
                var content = this.bbsCore.buf.getRowText(i, 0, this.bbsCore.buf.cols); //need parse to html tag.
                this.articleData.lines.push(content);
              }
              this.taskStage = 4;
              this.articleData.currentLine = statusInfo.rowIndexEnd;
              this.articleData.totalPage = statusInfo.pageTotal;
              this.articleData.currentPage++;
              this.bbsCore.conn.send('\x1b[6~'); //page down
            }
          }
        }
        //start crawl data
      }
    } else if(this.taskStage == 4) {
      var statusText = this.bbsCore.buf.getRowText(23, 0, this.bbsCore.buf.cols);
      if(this.strParser.getContentAlertMessage(statusText)) {
        this.taskStage = 6;
        this.bbsCore.conn.send('\x1b[A'); //arrow up
      } else {
        var statusInfo = this.strParser.parseArticleStatus(statusText);
        if(statusInfo && this.articleData.currentPage == statusInfo.pageNow) {
          if(statusInfo.pagePercent == 100) {
            //last page, crawl this page and exit
            var skipCount = this.articleData.currentLine - statusInfo.rowIndexStart + 1;
            for(var i=skipCount; i<23 && this.articleData.currentLine<statusInfo.rowIndexEnd; ++i,this.articleData.currentLine++) {
              var content = this.bbsCore.buf.getRowText(i, 0, this.bbsCore.buf.cols); //need parse to html tag.
              this.articleData.lines.push(content);
            }
            this.articleData.currentPage = statusInfo.pageNow;
            this.taskStage = 0;
            this.termStatus = 2;
            this.bbsCore.conn.send('\x1b[D'); //left
            var task = this.taskList.shift();
            task.callback(this.articleData);
            this.currentTask = this.taskDefines.none;
            this.runNextTask();
            return;
          } else {             
            //crawl all data in current page            
            for(var i=0;i<23;++i,this.articleData.currentLine++) {
              var content = this.bbsCore.buf.getRowText(i, 0, this.bbsCore.buf.cols); //need parse to html tag.
              this.articleData.lines.push(content);
            }
            this.articleData.currentPage++;
            this.bbsCore.conn.send('\x1b[6~'); //page down
          }
        }
      }
    } else if(this.taskStage == 5) {
      var line = this.bbsCore.buf.getRowText(0, 1, 6);
      if(line == '\u6A19\u984C') { //title
        this.taskStage = 3;
        this.bbsCore.conn.send('\x1b[A'); //arrow up
      } 
    } else if(this.taskStage == 6) {
      var line = this.bbsCore.buf.getRowText(0, 1, 6);
      if(line == '\u6A19\u984C') { //title
        this.taskStage = 3;
        this.bbsCore.conn.send('\x1b[B'); //arrow down
      } 
    } else if(this.taskStage == 7) {
      var line = this.bbsCore.buf.getRowText(23, 0, this.bbsCore.buf.cols);
      if(this.strParser.getLastPage(line)) {
        this.taskStage = 3;
        this.bbsCore.conn.send('\x1b[1~'); //home
      } 
    }
    setTimeout(this.getArticleContent.bind(this), this.timerInterval);
  },
  
  getBoardList: function() {
    this.currentTask = this.taskDefines.getBoardList;
  },
  
  login:function() {
  },

  logout: function() {
    //TODO: this task is hightest priority, cancel all task in progress.
    this.currentTask = this.taskDefines.logout;

    if(this.taskStage == 0) {
      this.taskStage = 1;
      if(this.termStatus != 0) {
        //this.bbsCore.conn.send('\x1b[D\x1b[D\x1b[D');
        this.bbsCore.conn.send('\x1b[D\x1ac\x1b[D');//left,ctrl+z,c,left
      }
    } else if(this.taskStage == 1) {
      var line = this.bbsCore.buf.getRowText(0, 0, this.bbsCore.buf.cols);
      if( this.strParser.getMainFunctionList(line) ) {
        this.termStatus = 0;
        this.taskStage = 2;
        this.bbsCore.conn.send('g' + this.prefs.EnterChar); //g + enter
      }
    } else if(this.taskStage == 2) {
      var line = this.bbsCore.buf.getRowText(22, 0, this.bbsCore.buf.cols);
      if( this.strParser.getExitMessage(line)) {
        this.bbsCore.conn.send('y' + this.prefs.EnterChar + ' '); //y + enter + space

        this.taskStage = 0;
        var task = this.taskList.shift();
        task.callback(); //if have water ball? need handle this case.
        this.currentTask = 0;
        this.removeAllTask();
        return;
      }
    }
    setTimeout(this.logout.bind(this), this.timerInterval);
  }
};

window.siteManager.regSite('PTT',
  {
    name: 'PTT',
    addr: 'ptt.cc',
    port: 23,
    protocol: 'telnet',
    prefsRoot: 'openptt.',
    col: 80,
    row: 24,
    charset: 'big5',
    enterChar: '^M',
    Robot: RobotPtt
  }
);