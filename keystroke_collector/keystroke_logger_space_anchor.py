from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtGui import QFont, QColor, QTextCharFormat , QTextCursor, QIntValidator
from PyQt5.QtWidgets import QFrame, QLineEdit, QLineEdit
from PyQt5.QtCore import Qt, QEvent, QUrl
from pynput import keyboard
from pynput.keyboard import Key, Listener, KeyCode
import time
import threading
from datetime import date, datetime
import json
from pathlib import Path
try:
    from send_file import send_file_scp
except Exception:
    send_file_scp = None

try:
    import requests
except Exception:
    requests = None

# Base URL of the Flask command relay server. The phone polls the same
# server (via ngrok) for start/stop commands. Override here if your ngrok
# subdomain changes.
FLASK_SERVER_URL = "https://gabled-rodger-macropodous.ngrok-free.dev"

# Delay after the first spacebar (phone start) before the second spacebar
# is accepted, so recording can begin before the timing anchor.
SECOND_SPACE_DELAY_MS = 2000

class Ui_main(QtWidgets.QMainWindow): 

    def __init__(self):
        super().__init__()

        self.setupUi()
        self.show()
        self._center_on_screen()

        self.script_dir = Path(__file__).resolve().parent
        self.data_dir = self.script_dir / "data"
        self.remote_user = "a4"
        self.remote_host = "rocky"
        self.remote_dest_dir = "/home/a4/workspace/zhuolin_workspace/Data/Timestamps/"
        self.flask_server_url = FLASK_SERVER_URL

    def keyPressEvent(self, e):
        if getattr(self, "await_record_start", False) and e.key() == Qt.Key_Space:
            self._first_space_start_recording()
            e.accept()
            return
        if self.rest_now and e.key() == Qt.Key_Space:
            self.start_session(e)
            e.accept()
            return
        super().keyPressEvent(e)

    def _key_name_from_event(self, event):
        if len(event.text()) > 0:
            return event.text()

        key_map = {
            Qt.Key_Space: 'space',
            Qt.Key_Escape: 'esc',
            Qt.Key_Tab: 'tab',
            Qt.Key_Backspace: 'backspace',
            Qt.Key_Shift: 'shift',
            Qt.Key_Enter: 'enter',
            Qt.Key_Return: 'enter',
            Qt.Key_Control: 'control',
            Qt.Key_Alt: 'alt',
            Qt.Key_Home: 'home',
            Qt.Key_Delete: 'delete',
        }
        return key_map.get(event.key(), str(event.key()))

    def _record_key_event(self, event):
        event_ts_ms = int(event.timestamp()) if hasattr(event, "timestamp") else None
        if event_ts_ms is not None and event_ts_ms < 0:
            event_ts_ms = None

        if self.first_key_event_ts_ms is None and event_ts_ms is not None:
            self.first_key_event_ts_ms = event_ts_ms

        key_name = self._key_name_from_event(event)
        record = {
            "type": "key",
            "key": key_name,
            "event_ts_ms": event_ts_ms,
            "event_ts_rel_ms": (
                event_ts_ms - self.first_key_event_ts_ms
                if event_ts_ms is not None and self.first_key_event_ts_ms is not None
                else None
            ),
            "logged_wall_time_ns": time.time_ns(),
            "logged_monotonic_ns": time.monotonic_ns(),
            "auto_repeat": bool(event.isAutoRepeat()),
        }

        self.keystrokes.append(key_name)
        self.timestamps.append(record)

    # setup typing ui
    def setupUi(self):  
        self.keystrokes = []
        self.timestamps = []
        self.session_start_wall_time_ns = None
        self.session_start_monotonic_ns = None
        self.first_key_event_ts_ms = None
        self.t = None
        self.in_session = False
        self.session_id = 0
        self.session_start_wall_time_ns = None
        self.session_start_monotonic_ns = None
        self.first_key_event_ts_ms = None

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

        # use the first 50 sentences exactly in the order defined above
        self.num_unique_elements = 50
        start_idx = 0
        if start_idx + self.num_unique_elements > len(self.all_texts):
            raise ValueError("Number of unique elements requested exceeds the available sentences.")
        self.sentence_sequence = list(range(start_idx, start_idx + self.num_unique_elements))

        self.setObjectName("MainWindow")
        _screen = QtWidgets.QApplication.primaryScreen().availableGeometry()
        _W = _screen.width()
        _H = _screen.height()
        _cx = _W // 2   # horizontal centre of the window
        self.resize(_W, _H)
        font = QtGui.QFont()
        font.setKerning(True)
        self.setFont(font)
        self.setStyleSheet("background-color: rgb(250, 250, 250); color: rgb(0, 0, 0);")
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
        self.restart.setGeometry(QtCore.QRect(_cx - 150, 80, 80, 40))

        self.rest_show = QtWidgets.QTextEdit(self.centralwidget)
        self.rest_show.setGeometry(QtCore.QRect(_cx - 460, _H // 2 - 80, 920, 160))
        self.rest_show.setObjectName("rest_show")
        self.rest_show.setVisible(False)
        self.rest_show.setReadOnly(True)
        self.rest_show.setFrameStyle(QFrame.NoFrame)
        self.rest_show.setFont(QFont('Arial', 24))
        self.rest_show.setStyleSheet("QTextEdit { color: rgb(0, 0, 0); background-color: rgb(250, 250, 250); }")
        self.rest_show.setText("Press [Space] to Continue.")
        self.rest_show.setAlignment(Qt.AlignCenter)
        
        self.line_edit = QLineEdit(self.centralwidget)
        self.line_edit.setObjectName("line_edit")
        self.line_edit.setGeometry(0, 0, 0, 0)
        self.line_edit.setStyleSheet("background-color: rgb(250, 250, 250); color: rgb(0, 0, 0);")
        self.line_edit.setFrame(False)
        self.line_edit.setAlignment(Qt.AlignCenter)
        self.line_edit.textChanged.connect(self.on_text_changed)
        self.line_edit.installEventFilter(self)

        self.text_show = QtWidgets.QTextEdit(self.centralwidget)
        self.text_show.setGeometry(QtCore.QRect(_cx - 460, _H // 2 - 80, 920, 160))
        self.text_show.setStyleSheet("QTextEdit { color: rgb(0, 0, 0); background-color: rgb(250, 250, 250); }")
        self.text_show.setObjectName("text_show")

        self._current_sentence = ""   # clean sentence text; set in resta/retranslateUi

        self.setCentralWidget(self.centralwidget)
        self.retranslateUi()
        QtCore.QMetaObject.connectSlotsByName(self)
        self.restart.setFocusPolicy(Qt.NoFocus)

        # Four identity fields that are joined with '_' to build the filename
        # base: name_location_keyboard_table. A per-sentence number is appended
        # in code (see _session_filename).
        self.id_fields = {}
        _field_specs = [
            ("name", "Name:"),
            ("location", "Location:"),
            ("keyboard", "Keyboard:"),
            ("table", "Table:"),
            ("distance", "Distance:"),
        ]
        _row_y = 130
        _row_step = 38
        for _i, (_key, _label_text) in enumerate(_field_specs):
            _y = _row_y + _i * _row_step

            _label = QtWidgets.QLabel(self.centralwidget)
            _label.setGeometry(QtCore.QRect(_cx - 220, _y, 110, 30))
            _label.setObjectName(f"{_key}_label")
            _label.setFont(QFont('Arial', 16))
            _label.setText(_label_text)
            _label.setVisible(True)
            _label.setTextInteractionFlags(QtCore.Qt.NoTextInteraction)

            _box = QtWidgets.QLineEdit(self.centralwidget)
            _box.setGeometry(QtCore.QRect(_cx - 100, _y, 220, 30))
            _box.setStyleSheet(
                "QLineEdit {"
                "  color: rgb(0, 0, 0);"
                "  background-color: rgb(255, 255, 255);"
                "  border: 1px solid rgb(0, 0, 0);"
                "  border-radius: 3px;"
                "}"
            )
            _box.setObjectName(f"text_{_key}")
            _box.setFont(QFont('Arial', 16))
            _box.setVisible(True)
            self.id_fields[_key] = _box

        # Keep individual handles for readability.
        self.text_name = self.id_fields["name"]
        self.text_location = self.id_fields["location"]
        self.text_keyboard = self.id_fields["keyboard"]
        self.text_table = self.id_fields["table"]
        self.text_distance = self.id_fields["distance"]
        self.text_name.setFocus()

        self.enter = QtWidgets.QPushButton(self.centralwidget)
        self.enter.setToolTip('Set the identity fields')
        self.enter.setGeometry(QtCore.QRect(_cx - 25, _row_y + len(_field_specs) * _row_step + 5, 60, 32))
        self.enter.setText("Set")

        self.progress = QtWidgets.QProgressBar(self.centralwidget)
        self.progress.setMaximum(self.num_unique_elements)
        self.progress.setGeometry(QtCore.QRect(max(_cx - 750, 10), 20, min(1500, _W - 80), 50))
        self.progress.setValue(0)
        self.progress.setVisible(True)

        self.progress_value = QtWidgets.QLabel(self.centralwidget)
        self.progress_value.setText(f"0 / {self.num_unique_elements}")
        self.progress_value.setGeometry(QtCore.QRect(_W - 70, 20, 60, 50))
        self.progress_value.setVisible(True)

        font.setPointSize(16)
        font.setWeight(50)
        self.previous = QtWidgets.QPushButton(self.centralwidget)
        self.previous.setFont(font)
        self.previous.setText("Previous")
        self.previous.setObjectName("previous")
        self.previous.setGeometry(QtCore.QRect(_cx - 250, 80, 80, 40))
        self.previous.setFocusPolicy(Qt.NoFocus)

        self.next = QtWidgets.QPushButton(self.centralwidget)
        self.next.setFont(font)
        self.next.setText("Next")
        self.next.setObjectName("next")
        self.next.setGeometry(QtCore.QRect(_cx - 50, 80, 80, 40))
        self.next.setFocusPolicy(Qt.NoFocus)

        self.text_jump_to_section = QtWidgets.QLineEdit(self.centralwidget)
        self.text_jump_to_section.setGeometry(QtCore.QRect(_cx + 50, 80, 80, 40))
        self.text_jump_to_section.setObjectName("text_jump_to_section")
        self.text_jump_to_section.setFont(QFont('Arial', 16))
        self.text_jump_to_section.setStyleSheet(
            "QLineEdit {"
            "  color: rgb(0, 0, 0);"
            "  background-color: rgb(255, 255, 255);"
            "  border: 1px solid rgb(0, 0, 0);"
            "  border-radius: 3px;"
            "}"
        )
        self.text_jump_to_section.setVisible(True) 
        intValidator = QIntValidator(1, 100, self)
        self.text_jump_to_section.setValidator(intValidator)

        self.jump = QtWidgets.QPushButton(self.centralwidget)
        self.jump.setFont(font)
        self.jump.setText("Jump")
        self.jump.setObjectName("jump")
        self.jump.setGeometry(QtCore.QRect(_cx + 150, 80, 80, 40))
        self.jump.setFocusPolicy(Qt.NoFocus)

        self.that_size = 0
        self.that_cursor = 0
        self.change_curs(0)
        self.rest_now = False
        self.await_record_start = False
        self.waiting_for_second_space = False
        self._second_space_timer = QtCore.QTimer(self)
        self._second_space_timer.setSingleShot(True)
        self._second_space_timer.timeout.connect(self._enable_second_space)
        self.add_function()

    def retranslateUi(self):
        _translate = QtCore.QCoreApplication.translate
        self.restart.setText(_translate("MainWindow", "↻"))

        self.setWindowTitle(_translate("MainWindow", "MainWindow"))

        _sentence = self.all_texts[self.sentence_sequence[self.session_id]].lower()
        self._current_sentence = _sentence
        self.text_show.setHtml(_translate("MainWindow", "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.0//EN\" \"http://www.w3.org/TR/REC-html40/text_showict.dtd\">\n"
                                "<html><head><meta name=\"qrichtext\" content=\"1\" /><style type=\"text/css\">\n"
                                "p, li { white-space: pre-wrap; }\n"
                                "</style></head><body style=\" font-family:'Arial'; font-size:24pt; font-weight:400; font-style:normal; color:#000000;\">\n"
                                "<p style=\" margin-top:0px; margin-bottom:0px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\"><span style=\" font-size:24pt;\">" + _sentence + "</span></p></body></html>"))
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

    def _field_value(self, key):
        return self.id_fields[key].text().strip()

    def _base_name(self):
        """Join the five identity fields with '_' to form the filename base."""
        return "_".join(self._field_value(key) for key in ("name", "location", "keyboard", "table", "distance"))

    def _session_filename(self):
        """Filename base for the current sentence, e.g. name_location_keyboard_table_001."""
        return f"{self._base_name()}_{self.session_id + 1:03d}"

    def set_user(self):
        if all(self._field_value(key) for key in ("name", "location", "keyboard", "table", "distance")):
            self.before_session()
    

    def eventFilter(self, source, event):
        if (
            source is self.line_edit
            and event.type() == QEvent.KeyPress
            and self.line_edit.hasFocus()
            and self.in_session
        ):
            self._record_key_event(event)

        return super().eventFilter(source, event)

    def _cancel_second_space_delay(self):
        self._second_space_timer.stop()
        self.waiting_for_second_space = False
        self.rest_now = False

    def before_session(self):
        self._cancel_second_space_delay()
        self.rest_show.setVisible(True)
        self.text_show.setVisible(False)
        self.setFocus()
        self.rest_show.setText("Press [Space] to start phone recording.")
        self.rest_show.setAlignment(Qt.AlignCenter)
        self.await_record_start = True
        self.in_session = False

    def _first_space_start_recording(self):
        """First spacebar: signal the phone to begin sensor recording, then
        wait for a second spacebar that anchors the keystroke timing."""
        session_name = self._session_filename()
        self._signal_phone_start(session_name)

        self.await_record_start = False
        self.rest_now = False
        self.waiting_for_second_space = True
        delay_s = SECOND_SPACE_DELAY_MS // 1000
        self.rest_show.setText(
            f"Phone recording starting. Please wait."
        )
        self.rest_show.setAlignment(Qt.AlignCenter)
        self._second_space_timer.start(SECOND_SPACE_DELAY_MS)

    def _enable_second_space(self):
        if not self.waiting_for_second_space:
            return
        self.waiting_for_second_space = False
        self.rest_now = True
        self.rest_show.setText("Press [Space] to begin sentence.")
        self.rest_show.setAlignment(Qt.AlignCenter)

    def start_session(self, space_event=None):
        """Begin a typing session, recording the triggering space press as the anchor event."""
        self._cancel_second_space_delay()
        self.await_record_start = False

        # Capture timestamps for the space keypress that starts the session.
        space_event_ts_ms = None
        if space_event is not None and hasattr(space_event, "timestamp"):
            ts = int(space_event.timestamp())
            if ts >= 0:
                space_event_ts_ms = ts

        space_wall_time_ns = time.time_ns()
        space_monotonic_ns = time.monotonic_ns()

        # The space that triggered the session is the synchronisation anchor.
        self.session_start_wall_time_ns = space_wall_time_ns
        self.session_start_monotonic_ns = space_monotonic_ns
        self.first_key_event_ts_ms = space_event_ts_ms

        # Record the space as the first entry so the JSON preserves it.
        space_record = {
            "type": "session_start_space",
            "key": "space",
            "event_ts_ms": space_event_ts_ms,
            "event_ts_rel_ms": 0,          # anchor — relative offset is zero by definition
            "logged_wall_time_ns": space_wall_time_ns,
            "logged_monotonic_ns": space_monotonic_ns,
            "auto_repeat": False,
        }
        self.keystrokes.append('space')
        self.timestamps.append(space_record)

        self.rest_show.setVisible(False)
        self.text_show.setVisible(True)

        self.in_session = True
        self.line_edit.setFocus()

    def previous_session(self): 
        if self.session_id > 0:
            self.before_session()
            self.resta(save_data=False, jump_to=self.session_id-1)

    def next_session(self):
        if self.session_id + 1 < self.num_unique_elements:
            self.before_session()
            self.resta(save_data=False, jump_to=self.session_id+1)
    
    def jump_to_session(self): 
        if 0 < int(self.text_jump_to_section.text()) < self.num_unique_elements + 1: 
            self.before_session()
            self.resta(save_data=False, jump_to=int(self.text_jump_to_section.text())-1)
            self.text_jump_to_section.clear()


    def save_data(self):
        data_to_save = {
            'keystroke': self.keystrokes,
            'timestamp': self.timestamps,
            'sentence': self.all_texts[self.sentence_sequence[self.session_id]].lower(),
            'timing_metadata': {
                'session_start_wall_time_ns': self.session_start_wall_time_ns,
                'session_start_monotonic_ns': self.session_start_monotonic_ns,
                'first_key_event_ts_ms': self.first_key_event_ts_ms,
                'note': (
                    'The first entry in timestamps (type=session_start_space) is the space '
                    'keypress that triggered the session. Its logged_wall_time_ns and '
                    'logged_monotonic_ns are the synchronisation anchor for IMU and '
                    'microphone recordings. event_ts_ms is the OS/Qt event timestamp and is '
                    'the best estimate of when the key event occurred. logged_* timestamps '
                    'are when Python recorded the event.'
                ),
            }
        }
        session_name = self._session_filename()

        self.data_dir.mkdir(parents=True, exist_ok=True)
        filename = self.data_dir / f"{session_name}.json"

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data_to_save, f, indent=2)

        self._send_saved_file(filename)
        self._signal_phone_stop(session_name)

    def _send_saved_file(self, file_path):
        if send_file_scp is None:
            print("send_file.py not available; skipping upload.")
            return

        def _worker():
            try:
                send_file_scp(
                    str(file_path),
                    self.remote_user,
                    self.remote_host,
                    self.remote_dest_dir,
                )
            except Exception as exc:
                print(f"Error sending file: {exc}")

        threading.Thread(target=_worker, daemon=True).start()

    def _signal_phone_command(self, action, filename):
        """POST a start/stop command to the Flask relay server. Runs on a
        daemon thread so HTTP latency never blocks the keystroke UI."""
        if requests is None:
            print("requests library not available; skipping phone signal.")
            return

        url = self.flask_server_url.rstrip("/") + "/api/command"
        payload = {"action": action, "filename": filename}

        def _worker():
            try:
                resp = requests.post(url, json=payload, timeout=5)
                if resp.ok:
                    print(f"Phone {action} signal sent (filename={filename!r}).")
                else:
                    print(f"Phone {action} signal failed: HTTP {resp.status_code} {resp.text}")
            except Exception as exc:
                print(f"Error signalling phone ({action}): {exc}")

        threading.Thread(target=_worker, daemon=True).start()

    def _signal_phone_start(self, filename):
        self._signal_phone_command("start", filename)

    def _signal_phone_stop(self, filename):
        self._signal_phone_command("stop", filename)

    def resta(self, save_data, jump_to):
        if save_data:
            self.save_data()
            self.progress.setValue(jump_to)
            self.progress_value.setText(f"{jump_to} / {self.num_unique_elements}")
        
        self.session_id = jump_to

        self._current_sentence = self.all_texts[self.sentence_sequence[self.session_id]].lower()
        self.text_show.setText(self._current_sentence)
        self.text_show.setAlignment(Qt.AlignCenter)
        self.text_show.setFont(QFont('Arial', 24))
        self.line_edit.clear()

        cur = self.text_show.textCursor()
        cur.setPosition(0)
        cur.setPosition(len(self.text_show.toPlainText()), QTextCursor.KeepAnchor)
        chr = QTextCharFormat()
        chr.setForeground(QColor('#000000'))
        cur.setCharFormat(chr)
        self.that_cursor = 0
        self.that_size = 0

        self.change_curs(0)

        self.keystrokes = []
        self.timestamps = []
        self.session_start_wall_time_ns = None
        self.session_start_monotonic_ns = None
        self.first_key_event_ts_ms = None

    def _trim_overflow(self):
        """Strip any overflow ■ blocks appended past the end of the sentence."""
        slen = len(self._current_sentence)
        if len(self.text_show.toPlainText()) > slen:
            cur = self.text_show.textCursor()
            cur.setPosition(slen)
            cur.movePosition(QTextCursor.End, QTextCursor.KeepAnchor)
            cur.removeSelectedText()

    def on_text_changed(self):
        txt = self.line_edit.text()
        tstr = self._current_sentence      # always the clean sentence, never includes overflow blocks
        ind = len(txt) - 1

        if ind + 1 > len(tstr):
            # User has typed past the sentence end — show one red ■ per overflow character.
            overflow = len(txt) - len(tstr)
            self._trim_overflow()
            cur = self.text_show.textCursor()
            cur.movePosition(QTextCursor.End)
            fmt = QTextCharFormat()
            fmt.setForeground(QColor('#000000'))
            fmt.setBackground(QColor('#f56e64'))
            fnt = QFont()
            fnt.setPointSize(24)
            fmt.setFont(fnt)
            cur.setCharFormat(fmt)
            cur.insertText(" ■" * overflow)

        elif ind + 1 == len(tstr):
            self._trim_overflow()
            if txt == tstr:
                self.change_color(ind, 1)
                self.before_session()
                self.resta(save_data=True, jump_to=self.session_id+1)
            else:
                self.change_color(ind, 2)

        else:
            self._trim_overflow()
            if ind < 0:
                if self.in_session:
                    if self.that_size > 0:
                        self.change_curs(0)
            else:
                if txt[ind] == tstr[ind]:
                    self.change_curs(ind + 1)
                    self.change_color(ind, 1)
                else:
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
        chr.setForeground(QColor('#000000'))
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
        char_format.setForeground(QColor('#000000'))
        if col == 2:
            char_format.setBackground(QColor('#f56e64'))
        elif col == 1:
            char_format.setBackground(QColor('#c0e3bc'))
        font = QFont()
        font.setPointSize(24)
        char_format.setFont(font)
        cursor.setCharFormat(char_format)

        cursor.insertText(sym)

    def _center_on_screen(self):
        screen = QtWidgets.QApplication.primaryScreen().availableGeometry()
        x = screen.x() + (screen.width() - self.width()) // 2
        y = screen.y() + (screen.height() - self.height()) // 2
        self.move(x, y)

    def end(self):
        self.text_show.setVisible(False)

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)

    ui = Ui_main()
    sys.exit(app.exec_())
