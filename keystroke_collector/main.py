from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtGui import QFont, QColor, QTextCharFormat , QTextCursor, QIntValidator
from PyQt5.QtWidgets import QFrame, QLineEdit, QLineEdit
from PyQt5.QtCore import Qt, QEvent
from pynput import keyboard
from pynput.keyboard import Key, Listener, KeyCode
import time
import threading
from datetime import date, datetime
import json
import subprocess
import random

class Ui_main(QtWidgets.QMainWindow): 

    def __init__(self):
        super().__init__()

        """ self.listener = None
        self.t = threading.Thread(target=self.start_listener)
        self.t.start()
        self.t.join() """

        self.setupUi()
        self.show()

        self.beep_file = "./beep.mp3"

    """ def on_keypress(self, key):
        if self.in_session: 
            try: 
                self.keystrokes.append(key.char)
            except AttributeError:
                if key == Key.space:
                    self.keystrokes.append('space')
                elif key == Key.esc:
                    self.keystrokes.append('esc')
                elif key == Key.shift:
                    self.keystrokes.append('shift')
                elif key == Key.backspace:
                    self.keystrokes.append('backspace')
                elif key == Key.enter:
                    self.keystrokes.append('enter')
                elif key == Key.caps_lock:
                    self.keystrokes.append('cap')
                elif key == Key.alt:
                    self.keystrokes.append('alt')
                elif key == Key.ctrl:
                    self.keystrokes.append('ctrl')
                else:
                    self.keystrokes.append(str(key)) 
            self.timestamps.append(time.time())
        elif self.rest_now: 
            try: 
                print(key.char)
            except AttributeError:
                if key == Key.space:
                    self.start_session()
    
    def start_listener(self):
        self.listener = Listener(on_press=lambda key: self.on_keypress(key)) 
        self.listener.start()

    def stop_listener(self):
        if self.listener:
            self.listener.stop()  """

    def keyPressEvent(self, e):
        #print("keypressed: ", e.key(), e.text())
        if self.rest_now:
            if e.key() == Qt.Key_Space:
                self.start_session() 
        elif self.in_session: 
            if len(e.text()) > 0:
                self.keystrokes.append(e.text())
            else: 
                if e.key() == Qt.Key_Space:
                    self.keystrokes.append('space')
                elif e.key() == Qt.Key_Escape:
                    self.keystrokes.append('esc')
                elif e.key() == Qt.Key_Tab:
                    self.keystrokes.append('tab')
                elif e.key() == Qt.Key_Backspace:
                    self.keystrokes.append('backspace')
                elif e.key() == Qt.Key_Shift:
                    self.keystrokes.append('shift')
                elif e.key() == Qt.Key_Enter:
                    self.keystrokes.append('enter')
                elif e.key() == Qt.Key_Control:
                    self.keystrokes.append('control')
                elif e.key() == Qt.Key_Alt:
                    self.keystrokes.append('alt')
                elif e.key() == Qt.Key_Home:
                    self.keystrokes.append('home')
                elif e.key() == Qt.Key_Delete:
                    self.keystrokes.append('delete')
                else:
                    self.keystrokes.append(e.key())
            self.timestamps.append(time.time()) 

    # setup typing ui
    def setupUi(self):  
        self.keystrokes = []
        self.timestamps = []
        self.t = None
        self.in_session = False
        self.session_id = 0

        self.all_texts = [
            "As prices rose, supply increased and demand decreased.",
            "I am not sure about my arrival and departure dates, but I did put tentative dates.",
            "I will be out of the office on Friday, Monday and Tuesday for vacation.",
            "Please proceed with the immediate preparation of an Enron Corp.",
            "I needed to apologize for my inability to handle myself in more of a professional manner.",
            "John, Jim and Brad were instrumental in getting this restructuring done.",
            "I am sending this notification to your department to seek a solution of",
            "halting and stopping inappropriate email materials which I am receiving.",
            "Please feel free to use those parts of it you feel appropriate.",
            "I am interested in purchasing a Huglu shotgun and would like to get a price.",
            "Your assistance would be sincerely appreciated.",
            "I am on special assignment on the Southwest side of time.",
            "I wanted to see if you might be interested in getting together sometime.",
            "This conference should last for approximately one hour.",
            "Attached is a draft of the services agreement with Garden State Paper.",
            "I could not open up the attachment but I could view it.",
            "In order to access the phone system I need a password.",
            "Just goes to show that sometimes prayers are answered.",
            "The deal with Williams Terminals expired in Oct.",
            "On a per turbine basis he would be expecting some to have big drops.",
            "A list of the presentations that were made at the meeting will appear on the screen.",
            "I just received your message about the loan extensions and Central Bank registrations.",
            "The weather was good and the food was great.",
            "I logged into the trading cluster and it appears that it is quite similar to general cluster.",
            "The goal will be to help us better understand our legal risks on a consolidated basis",
            "and to provide additional tools to manage our legal risks day to day.",
            "Also, please identify one person from your organization that can be used for coordination purposes.",
            "We need to keep a running tally of how much we use.",
            "My secretary will know how to reach me and I will be checking voice mail.",
            "Unfortunately I am unable to attend as this is the same night as our ETS Holiday Party.",
            "We need closure on the guaranty issue.",
            "I will take the lead to draft the guaranty and have it forward to Enron Corp for approval prior to sending it out as a draft to Engage Energy Marketing.",
            "We had a nice lunch at an outdoor cafe, went shopping in the Village, and then went back to my house for a chat.",
            "Please, resend me the term papers of your group, each as a separate file.",
            "If you are able to attend all or part of the meeting please advise.",
            "Hey Peter, Could you pass this on to the proper person.",
            "Just wanted to let you know that we have started working on the TW contract and capacity release system.",
            "I am a PhD student at Iowa State University, working under Dr. Bartlett in the Adaptive Computing Lab.",
            "There is an issue regarding the foreign exchange on the Houston reserve as detailed on this spreadsheet.",
            "Sorry for the delay, but at least we are sure he wants to do it.",
            "My guys tell me we are just about finished on our end and will be getting ready to beta test.",
            "A printed copy of project photos is being forwarded to you separately.",
            "Kimberly, I was laid off on Monday and have not had my latest expense report electronically deposited into the credit union.",
            "The following are the estimated sales and heater consumption per month.",
            "Please explain how we will manage the price risk on this.",
            "We need this data as soon as you can so that we can begin to look at cargo options.",
            "It also mentioned that such agreement was to be supported with a contract covering all the legal aspects of such throughput.",
            "We are very flexible on the dates for a June meeting.",
            "We are very happy to have you visit our city of Houston.",
            "I hope that you are well and that we can meet early next month.",
            "A small research boutique with a reputation for rigorous analysis is telling clients to quickly dump Enron.",
            "As this will directly effect all gas coming out of the Powder River,",
            "please contact your marketer directly as to how much gas they will be able to deliver into WIC on that day.",
            "I have not received September Statements, was afraid that they went to the wrong email address.",
            "Questions addressed include those about Enron stock options, benefits and immigration status.",
            "I just wanted to check to see if you have had a chance to review the file I sent to you for October.",
            "All fares are quoted in US Dollars.",
            "Please check your contracts for any possible cuts during this period.",
            "I have noted a few possible changes and one question.",
            "You have received this email because the requester specified you as their Manager.",
            "She wants to have you on the call and would like to know when you would be available.",
            "I told them that if they have specific questions then we would be more than happy to answer them.",
            "We looked at this data and found that if you look at it on a percentage basis you are skewing the story.",
            "We just need to notify them where the money is and state the money is for the purpose of this rule.",
            "As you know, Enron has signed a merger agreement by which Dynegy will acquire Enron.",
            "Even though Enron has entered into this agreement,",
            "U.S. and foreign antitrust laws require that Enron and Dynegy continue to operate independently of each other.",
            "We were again delayed by the california market information inaccuracies.",
            "Also, in order to manage our currency exposures there are certain reports that we are going to need.",
            "Unless we indicate otherwise ASAP we will not be participating in this filing.",
            "Attached is a revised version of the protest to the definitive agreements.",
            "You need to document this for the attorney.",
            "Please give Mike Grigsby access to create products in product manager and manage products for the following product types.",
            "She is still the mother of your child so please try and rise above.",
            "It takes Power, Gas, Weather and demand information into consideration and uses Monte Carlo simulation to assess the expected deal value and risk distribution.",
            "Registration is required for a head count.",
            "Please stay tuned for additional updates.",
            "The section with major players is the one with the utilities that are tied to an index,",
            "however, there are some minor utilities that are not covered in that list.",
            "I updated the Physical Power Terminated spreadsheet with the following update.",
            "I typically do not keep environmental information for projects",
            "because it takes up so much room and nobody ever asks for it.",
            "However, this does have facility location maps of the project and various alternatives.",
            "This may not be the final routing, but it will be pretty close.",
            "A link to the replay of the webcast is available at www.enron.com.",
            "To view a presentation, simply click on the title.",
            "The agenda for the meeting tomorrow is to review the findings and potential recommendations and decide on a course of action.",
            "I am just wanting to notify you all that I have a new personal email address.",
            "May you all enjoy yourselves these next couple of weeks.",
            "Citizens is encouraged to see that steps are being taken and will continue to monitor the situation.",
            "As I am not involved in the daily operations behind this deal,",
            "I will need your input in order to respond to this request.",
            "As I have indicated, the frequency of cuts has caused tremendous concern and Citizens is considering walking away from this deal.",
            "As I have discussed with you, Citizens is concerned about the frequency of upstream supply issues that",
            "have resulted in the recent cuts in the deliveries to the Griffith power plant.",
            "Citizens therefore requests that Enron respond to Citizens in writing with a descriptions of the steps Enron is taking to insure that there is not a continuation of these contract performance issues into the future.",
            "Your prompt attention to this matter is appreciated.",
            "Thank you very much for your obvious interest and commitment to doing a high quality job in your PRC representative role.",
            "I am currently in my first rotation as an Associate which I began this past summer following graduation from UT with an MBA in Energy Finance.",
        ]

        # generate the list of unique random numbers for showing sentences in random sequence
        min_value = 0
        max_value = len(self.all_texts)
        self.num_unique_elements = 25
        if self.num_unique_elements > (max_value - min_value + 1):
            raise ValueError("Number of unique elements requested exceeds the range size.")
        self.sentence_sequence = random.sample(range(min_value, max_value + 1), self.num_unique_elements)

        self.setObjectName("MainWindow")
        self.resize(1920, 1080)
        font = QtGui.QFont()
        font.setKerning(True)
        self.setFont(font)
        self.setStyleSheet("background-color: rgb(250, 250, 250);") 
        self.centralwidget = QtWidgets.QWidget(self)
        self.centralwidget.setObjectName("centralwidget")
        
        font = QtGui.QFont()
        font.setFamily("Arial")
        font.setPointSize(24)
        font.setBold(True)
        font.setWeight(75)
        font.setStrikeOut(False)
        self.restart = QtWidgets.QPushButton(self.centralwidget)
        self.restart.setFont(font)
        self.restart.setObjectName("restart")
        self.restart.setGeometry(QtCore.QRect(810, 80, 80, 40))

        self.rest_show = QtWidgets.QTextEdit(self.centralwidget)
        self.rest_show.setGeometry(QtCore.QRect(500, 500, 920, 160))
        self.rest_show.setObjectName("rest_show")
        self.rest_show.setVisible(False)
        self.rest_show.setReadOnly(True)
        self.rest_show.setFrameStyle(QFrame.NoFrame)
        self.rest_show.setFont(QFont('Arial', 24))
        self.rest_show.setText("Press [Space] to Continue.")
        self.rest_show.setAlignment(Qt.AlignCenter)
        
        self.line_edit = QLineEdit(self.centralwidget)
        self.line_edit.setObjectName("line_edit")
        self.line_edit.setGeometry(0, 0, 0, 0)
        self.line_edit.setStyleSheet("background-color: rgb(250, 250, 250);") 
        self.line_edit.setFrame(False)
        self.line_edit.setAlignment(Qt.AlignCenter)
        self.line_edit.textChanged.connect(self.on_text_changed)
        self.line_edit.installEventFilter(self)

        self.text_show = QtWidgets.QTextEdit(self.centralwidget)
        self.text_show.setGeometry(QtCore.QRect(500, 500, 920, 160))
        self.text_show.setObjectName("text_show")
        self.setCentralWidget(self.centralwidget)
        self.retranslateUi()
        QtCore.QMetaObject.connectSlotsByName(self)
        self.restart.setFocusPolicy(Qt.NoFocus)

        self.text_user_label = QtWidgets.QLabel(self.centralwidget)
        self.text_user_label.setGeometry(QtCore.QRect(790, 150, 90, 30))
        self.text_user_label.setObjectName("text_user_label")
        self.text_user_label.setFont(QFont('Arial', 16))
        self.text_user_label.setText("Username:")
        self.text_user_label.setVisible(True)
        self.text_user_label.setTextInteractionFlags(QtCore.Qt.NoTextInteraction)  

        self.text_user = QtWidgets.QTextEdit(self.centralwidget)
        self.text_user.setGeometry(QtCore.QRect(875, 150, 200, 30))
        self.text_user.setObjectName("text_user")
        self.text_user.setFont(QFont('Arial', 16))
        self.text_user.setPlainText("")
        self.text_user.setVisible(True)
        self.text_user.setFocus()

        self.enter = QtWidgets.QPushButton(self.centralwidget)
        self.enter.setToolTip('Set the username')
        self.enter.setGeometry(QtCore.QRect(1080, 150, 50, 30))
        self.enter.setText("Set")

        self.progress = QtWidgets.QProgressBar(self.centralwidget)
        self.progress.setMaximum(self.num_unique_elements)
        self.progress.setGeometry(QtCore.QRect(190, 20, 1500, 50))
        self.progress.setValue(0)
        self.progress.setVisible(True)

        self.progress_value = QtWidgets.QLabel(self.centralwidget)
        self.progress_value.setText(f"0 / {self.num_unique_elements}")
        self.progress_value.setGeometry(QtCore.QRect(1695, 20, 50, 50))
        self.progress_value.setVisible(True)

        font.setPointSize(16)
        font.setWeight(50)
        self.previous = QtWidgets.QPushButton(self.centralwidget)
        self.previous.setFont(font)
        self.previous.setText("Previous")
        self.previous.setObjectName("previous")
        self.previous.setGeometry(QtCore.QRect(710, 80, 80, 40))
        self.previous.setFocusPolicy(Qt.NoFocus)

        self.next = QtWidgets.QPushButton(self.centralwidget)
        self.next.setFont(font)
        self.next.setText("Next")
        self.next.setObjectName("next")
        self.next.setGeometry(QtCore.QRect(910, 80, 80, 40))
        self.next.setFocusPolicy(Qt.NoFocus)

        self.text_jump_to_section = QtWidgets.QLineEdit(self.centralwidget)
        self.text_jump_to_section.setGeometry(QtCore.QRect(1010, 80, 80, 40))
        self.text_jump_to_section.setObjectName("text_jump_to_section")
        self.text_jump_to_section.setFont(QFont('Arial', 16))
        self.text_jump_to_section.setVisible(True) 
        intValidator = QIntValidator(1, 100, self)
        self.text_jump_to_section.setValidator(intValidator)

        self.jump = QtWidgets.QPushButton(self.centralwidget)
        self.jump.setFont(font)
        self.jump.setText("Jump")
        self.jump.setObjectName("jump")
        self.jump.setGeometry(QtCore.QRect(1110, 80, 80, 40))
        self.jump.setFocusPolicy(Qt.NoFocus)

        self.that_size = 0
        self.that_cursor = 0
        self.change_curs(0)
        self.rest_now = False
        self.add_function()

    def retranslateUi(self):
        _translate = QtCore.QCoreApplication.translate
        self.restart.setText(_translate("MainWindow", "↻"))

        self.setWindowTitle(_translate("MainWindow", "MainWindow"))

        self.text_show.setHtml(_translate("MainWindow", "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.0//EN\" \"http://www.w3.org/TR/REC-html40/text_showict.dtd\">\n"
                                "<html><head><meta name=\"qrichtext\" content=\"1\" /><style type=\"text/css\">\n"
                                "p, li { white-space: pre-wrap; }\n"
                                "</style></head><body style=\" font-family:\'Arial\'; font-size:24pt; font-weight:400; font-style:normal;\">\n"
                                "<p style=\" margin-top:0px; margin-bottom:0px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\"><span style=\" font-size:24pt;\">" + self.all_texts[self.sentence_sequence[self.session_id]].lower() + "</span></p></body></html>"))
        self.text_show.setReadOnly(True)

        self.text_show.setFrameStyle(QFrame.NoFrame)
        self.text_show.setTextInteractionFlags(QtCore.Qt.NoTextInteraction)  
        self.text_show.setFont(QFont('Arial', 24))
        self.text_show.setVisible(False)
        self.text_show.setAlignment(Qt.AlignCenter)
        
    def add_function(self): 
        self.restart.clicked.connect(lambda: self.resta(save_data=False, jump_to=self.session_id))
        self.enter.clicked.connect(lambda: self.set_user())
        self.previous.clicked.connect(lambda: self.previous_session())
        self.next.clicked.connect(lambda: self.next_session())
        self.jump.clicked.connect(lambda: self.jump_to_session())

    def set_user(self):
        if len(self.text_user.toPlainText()) >= 2:
            self.before_session()
    
    def eventFilter(self, source, event):
        if event.type() == QEvent.KeyPress:
            if self.line_edit.hasFocus(): 
                if self.in_session: 
                    #print("keypressed: ", event.key(), event.text())
                    if len(event.text()) > 0:
                        self.keystrokes.append(event.text())
                    else: 
                        if event.key() == Qt.Key_Space:
                            self.keystrokes.append('space')
                        elif event.key() == Qt.Key_Escape:
                            self.keystrokes.append('esc')
                        elif event.key() == Qt.Key_Tab:
                            self.keystrokes.append('tab')
                        elif event.key() == Qt.Key_Backspace:
                            self.keystrokes.append('backspace')
                        elif event.key() == Qt.Key_Shift:
                            self.keystrokes.append('shift')
                        elif event.key() == Qt.Key_Enter:
                            self.keystrokes.append('enter')
                        elif event.key() == Qt.Key_Control:
                            self.keystrokes.append('control')
                        elif event.key() == Qt.Key_Alt:
                            self.keystrokes.append('alt')
                        elif event.key() == Qt.Key_Home:
                            self.keystrokes.append('home')
                        elif event.key() == Qt.Key_Delete:
                            self.keystrokes.append('delete')
                        else:
                            self.keystrokes.append(event.key())
                    self.timestamps.append(time.time()) 
                
        return super().eventFilter(source, event)

    def before_session(self): 
        self.rest_show.setVisible(True)
        self.text_show.setVisible(False)
        self.setFocus()
        self.rest_now = True
        self.in_session = False
        
    def start_session(self):
        self.rest_now = False
        self.in_session = True

        subprocess.call(["afplay", self.beep_file])
        self.timestamps.append(time.time())
        self.keystrokes.append('beep')

        self.rest_show.setVisible(False)
        self.text_show.setVisible(True)
        self.line_edit.setFocus()

    def previous_session(self): 
        if self.session_id > 0:
            self.before_session()
            self.resta(save_data=False, jump_to=self.session_id-1)

    def next_session(self):
        if self.session_id + 1 < 25:
            self.before_session()
            self.resta(save_data=False, jump_to=self.session_id+1)
    
    def jump_to_session(self): 
        if 0 < int(self.text_jump_to_section.text()) < self.num_unique_elements + 1: 
            self.before_session()
            self.resta(save_data=False, jump_to=int(self.text_jump_to_section.text())-1)
            self.text_jump_to_section.clear()

    def save_data(self):
        data_to_save = {
            'keystroke' : self.keystrokes,
            'timestamp' : self.timestamps,
            'sentence' : self.all_texts[self.sentence_sequence[self.session_id]].lower()
        }
        username = self.text_user.toPlainText()
        today = date.today().strftime("%d%m%Y")
        now = datetime.now().strftime("%H%M%S")
        filename = f"data/{username}_{today}_{now}_{self.session_id}.json"

        with open(filename, 'w') as f:
            json.dump(data_to_save, f)

    def resta(self, save_data, jump_to):
        if save_data:
            self.save_data()
            self.progress.setValue(self.session_id)
            self.progress_value.setText(f"{self.session_id} / {self.num_unique_elements}")
        
        self.session_id = jump_to

        self.text_show.setText(self.all_texts[self.sentence_sequence[self.session_id]].lower())
        self.text_show.setAlignment(Qt.AlignCenter)
        self.text_show.setFont(QFont('Arial', 24))
        self.line_edit.clear()
    
        cur = self.text_show.textCursor() 
        cur.setPosition(0)
        cur.setPosition(len(self.text_show.toPlainText()), QTextCursor.KeepAnchor)
        chr = QTextCharFormat()
        cur.setCharFormat(chr)
        self.that_cursor = 0
        self.that_size = 0
        
        self.change_curs(0)

        self.keystrokes = []
        self.timestamps = []

    def on_text_changed(self):
        txt = self.line_edit.text()
        tstr = self.text_show.toPlainText()
        ind = len(txt) - 1

        if (ind + 1 > len(tstr)):
            print("Please correct the typo.")
        
        elif (ind + 1 == len(tstr)): 
            if txt == tstr:
                self.before_session()
                self.resta(save_data=True, jump_to=self.session_id+1)
            else:
                print("Please correct the typo.")

        else:
            if ind < 0:
                if self.in_session: 
                    if self.that_size > 0: 
                        self.change_curs(0)
            else: 
                if (txt[ind] == tstr[ind]):
                    if ind + 1 < len(tstr): 
                        self.change_curs(ind + 1)
                        self.change_color(ind, 1)   

                else:
                    if ind + 1 < len(tstr): 
                        self.change_curs(ind + 1)
                        self.change_color(ind, 2)
                    
        self.that_size += 1

    def change_curs(self, i):
        sym = self.text_show.toPlainText()[self.that_cursor]
        cur = self.text_show.textCursor() 
        cur.setPosition(self.that_cursor),
        cur.setPosition(self.that_cursor + 1, QTextCursor.KeepAnchor)
        cur.removeSelectedText()
        curs = self.text_show.textCursor() 
        curs.setPosition(self.that_cursor)
        chr = QTextCharFormat() 
        font = QFont()
        font.setPointSize(24)
        chr.setFont(font)
        curs.setCharFormat(chr)
        curs.insertText(sym)
        self.that_cursor = i
        sym = self.text_show.toPlainText()[i]
        cur = self.text_show.textCursor() 
        cur.setPosition(i),
        cur.setPosition(i + 1, QTextCursor.KeepAnchor)
        cur.removeSelectedText()
        curs = self.text_show.textCursor() 
        
        curs.setPosition(i)
        chr = QTextCharFormat() 
        font = QFont()
        font.setPointSize(24)
        chr.setFont(font)
        chr.setBackground(QColor("#c7b7cc"))
        curs.setCharFormat(chr)
        curs.insertText(sym)

    def change_color(self, i, col):
        temp = self.text_show.toPlainText() 
        sym = temp[i]
        cur = self.text_show.textCursor() 
        cur.setPosition(i),
        cur.setPosition(i + 1, QTextCursor.KeepAnchor)
        cur.removeSelectedText()
        
        cursor = self.text_show.textCursor() 

        cursor.setPosition(i)

        char_format = QTextCharFormat()
        if col == 0:
            char_format.setForeground(QColor('#000000'))
        elif col == 2:
            char_format.setBackground(QColor('#f56e64'))
        else:
            char_format.setBackground(QColor('#c0e3bc'))
        font = QFont()
        font.setPointSize(24)
        char_format.setFont(font)
        cursor.setCharFormat(char_format)

        cursor.insertText(sym)

    def end(self):
        self.text_show.setVisible(False)

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)

    ui = Ui_main()
    sys.exit(app.exec_())