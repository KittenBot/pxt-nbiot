/*
Riven
load dependency
"nbiot": "file:../pxt-nbiot"
*/

//% color="#31C7D5" weight=10 icon="\uf1eb"
namespace nbiot {


    const PortSerial = [
        [SerialPin.P8, SerialPin.P0],
        [SerialPin.P12, SerialPin.P1],
        [SerialPin.P13, SerialPin.P2],
        [SerialPin.P15, SerialPin.P14]
    ]

    export enum SerialPorts {
        PORT1 = 0,
        PORT2 = 1,
        PORT3 = 2,
        PORT4 = 3
    }

    export class StringMessageHandler {
        topicName: string;
        fn: (stringMessage: string) => void;
    }

    export class KeyValueMessageHandler {
        topicName: string;
        fn: (key: string, value: string) => void;
    }

    export class KeyValueMessage {
        key: string;
        value: string;
    }

    export class MakerCloudMessage {
        deviceName: string;
        deviceSerialNumber: string;
        rawMessage: string;
        stringMessageList: string[];
        keyValueMessagList: KeyValueMessage[];
    }

    type EvtStr = (data: string) => void;
    type EvtAct = () => void;
    type EvtNum = (data: number) => void;
    type EvtDict = (topic: string, data: string) => void;

    let netConn: EvtAct = null;
    let mqttOpen: EvtAct = null;

    let lastCmd: string;
    let topicCB: StringMessageHandler[] = []
    let stringMessageHandlerList: StringMessageHandler[] = []
    let keyValueMessageHandlerList: KeyValueMessageHandler[] = []
    let isConn: boolean = false;

    function trim(n: string):string {
        while (n.charCodeAt(n.length-1)<0x1f) {
            n = n.slice(0, n.length-1)
        }
        return n;
    }

    function handleTopicStringMessage(topic: string, stringMessageList: string[]) {
        let i = 0
        for (i = 0; i < stringMessageHandlerList.length; i++) {
            if (stringMessageHandlerList[i].topicName == topic) {
                let j = 0;
                for (j = 0; j < stringMessageList.length; j++) {
                    stringMessageHandlerList[i].fn(stringMessageList[j]);
                }
                break
            }
        }
    }

    function handleTopicKeyValueMessage(topic: string, keyValueMessageList: KeyValueMessage[]) {
        let i = 0
        for (i = 0; i < keyValueMessageHandlerList.length; i++) {
            if (keyValueMessageHandlerList[i].topicName == topic) {
                let j = 0;
                for (j = 0; j < keyValueMessageList.length; j++) {
                    keyValueMessageHandlerList[i].fn(keyValueMessageList[j].key, keyValueMessageList[j].value);
                }
                break
            }
        }
    }

    export function countDelimitor(msg: string, delimitor: string): number {
        let count: number = 0;
        let i = 0;
        for (i = 0; i < msg.length; i++) {
            if (msg.charAt(i) == delimitor) {
                count++;
            }
        }
        return count;
    }

    export function parseMakerCloudMessage(topicMessage: string): MakerCloudMessage {
        let makerCloudMessage = new MakerCloudMessage();
        makerCloudMessage.rawMessage = topicMessage;
        makerCloudMessage.deviceName = "";
        makerCloudMessage.deviceSerialNumber = "";
        makerCloudMessage.keyValueMessagList = [];
        makerCloudMessage.stringMessageList = [];

        let delimitor = ",";
        let start = 0;
        let oldMessage: string = topicMessage;

        let i = 0;
        let total = countDelimitor(oldMessage, delimitor);
        for (i = 0; i <= total; i++) {
            let end = oldMessage.indexOf(delimitor);
            if (end == -1) {
                end = oldMessage.length
            }
            let subMessage = oldMessage.substr(0, end);
            if (subMessage.indexOf("=") == -1) {
                makerCloudMessage.stringMessageList[makerCloudMessage.stringMessageList.length] = subMessage
            } else {
                let splitIndex = subMessage.indexOf("=");
                let key = subMessage.substr(0, splitIndex);
                let value = subMessage.substr(splitIndex + 1)

                if (value.length > 0) {
                    if (key == "_dsn") {
                        makerCloudMessage.deviceSerialNumber = value;
                    } else if (key == "_dn") {
                        makerCloudMessage.deviceName = value;
                    } else {
                        let keyValue = new KeyValueMessage();
                        keyValue.key = key;
                        keyValue.value = value;
                        makerCloudMessage.keyValueMessagList[makerCloudMessage.keyValueMessagList.length] = keyValue;
                    }
                }
            }
            oldMessage = oldMessage.substr(end + 1, oldMessage.length);
        }

        return makerCloudMessage;
    }

    serial.onDataReceived('\n', function () {
        let a = serial.readString()
        if (a.charCodeAt(0) > 0x1f) {
            console.log(">>" + a)
        }
        
        if (a.charAt(0) == '+') {
            a = trim(a)
            let b = a.slice(1, a.length).split(":")
            let cmd = b[0]
            let params = b[1].split(',')
            if (cmd == "CEREG") { // eps registered
                if ((params.length == 2 && params[1].charAt(0) == '1') ||
                    (params.length == 1 && params[0].charAt(0) == '1')
                ) {
                    isConn = true;
                    if (netConn) netConn()
                }
            } else if (cmd == "MQTTOPEN") {
                if (mqttOpen) mqttOpen()
            } else if (cmd == "MQTTPUBLISH") {
                let topic = params[4]
                let data = params[6]
                for (let i = 0; i < topicCB.length; i++) {
                    if (topicCB[i].topicName == topic) {
                        topicCB[i].fn(data)
                    }
                }
                let makerCloudMessage = parseMakerCloudMessage(data);
                handleTopicStringMessage(topic, makerCloudMessage.stringMessageList);
                handleTopicKeyValueMessage(topic, makerCloudMessage.keyValueMessagList)
            }
        }

    })

    function sendAtCmd(op: string, cmd: string) {
        let str = "AT+" + op + "=" + cmd
        lastCmd = op
        serial.writeLine(str)
        basic.pause(200)
    }

    /**
     * init serial port
     * @param tx Tx pin; eg: SerialPin.P1
     * @param rx Rx pin; eg: SerialPin.P2
    */
    //% blockId=nbiot_init block="NBIOT init|Tx pin %tx|Rx pin %rx"
    //% weight=100
    export function nbiot_init(tx: SerialPin, rx: SerialPin): void {
        serial.redirect(
            tx,
            rx,
            BaudRate.BaudRate9600
        )
        basic.pause(100)
        serial.setTxBufferSize(64)
        serial.setRxBufferSize(64)
        serial.readString()
        serial.writeString('\n\n')
        basic.pause(1000)
    }

    //% blockId=nbiot_join4g block="NBIOT Join 4G"
    //% weight=100
    export function nbiot_join4g() {
        // cell init sequence
        serial.writeLine("AT+NRB")
        basic.pause(8000) // wait reboot finish
        sendAtCmd("COPS", `0`)
        sendAtCmd("CGATT", `1`)
        sendAtCmd("CSCON", `1`)
        sendAtCmd("CEREG", `1`)
        serial.writeLine("AT+CSQ")
        let cnt = 1;
        while (!isConn) {
            basic.showIcon(IconNames.Diamond)
            basic.pause(500)
            basic.showIcon(IconNames.SmallDiamond)
            basic.pause(500)
            cnt += 1;
            if (cnt % 5 == 0) {
                nbiot_checkcon()
            }
            if (cnt > 120) {
                // max 2min wait
                basic.showIcon(IconNames.No)
                return;
            }
        }
        basic.showIcon(IconNames.Heart)
    }

    /**
     * Mqtt host config
     * @param host Mqtt server ip or address; eg: iot.kittenbot.cn
     * @param port host port; eg: 1883
     * @param id Client Id; eg: node01
    */
    //% blockId=nbiot_mqttconfig block="Mqtt Config Host %host|Port %port|ClientID %id|User %user|Pass %pass"
    //% weight=100
    export function nbiot_config(host: string, port: number, id: string, user?: string, pass?: string): void {
        let cmd = `"${host}",${port},"${id}",60,"${user}","${pass}",1`
        sendAtCmd("MQTTCFG", cmd)
    }

    //% blockId=onenet_connect block="OneNet(mqtt) ProductID%prodid DevID%deviceid SN%sn"
    //% weight=90
    export function onenet_connect(prodid: string, deviceid: string, sn: string): void {
        nbiot_config("mqtt.heclouds.com", 6002, deviceid, prodid, sn)
    }

    function int2hex(a: number): string {
        let hexlist = "0123456789ABCDEF"
        let b = hexlist.charAt((a & 0xf0) >> 4) + hexlist.charAt(a & 0xf)
        return b;
    }

    //% blockId=onenet_pub block="OneNet Pub DataStream%topic Data%data"
    //% weight=80
    export function onenet_pub(topic: string, data: string): void {
        let cmd = ",;" + topic + "," + data + ";"
        // let output = "\${5}\${0}\${" + cmd.length + "}" + cmd;
        let hexlen = cmd.length + 3;
        let hexstr = "0500" + int2hex(cmd.length)
        for (let i=0;i<cmd.length;i++){
            hexstr += int2hex(cmd.charCodeAt(i))
        }
        // nbiot_mqttpub("$dp", output);
        sendAtCmd("MQTTPUB", `"$dp",1,0,0,${hexlen},"${hexstr}"`)
    }

    //% blockId=nbiot_mqttconn block="Mqtt Connect"
    export function nbiot_mqttconn() {
        let cmd = `1,1,0,0,0,"",""`
        sendAtCmd("MQTTOPEN", cmd)
    }

    //% blockId=nbiot_mqttsub block="Mqtt Subscribe %topic"
    export function nbiot_mqttsub(topic: string) {
        sendAtCmd("MQTTSUB", `"${topic}",1`)
    }

    //% blockId=nbiot_mqtt_onmsg block="on Mqtt Msg topic%topic"
    export function nbiot_mqtt_onmsg(topic: string, handler: (str: string) => void) {
        let topicHandler = new StringMessageHandler()
        topicHandler.fn = handler
        topicHandler.topicName = topic
        topicCB.push(topicHandler)
    }

    //% blockId=nbiot_mqttpub block="Mqtt Public %topic data%data||Qos %qos"
    export function nbiot_mqttpub(topic: string, data: string, qos?: number) {
        if (qos == undefined) qos = 1;
        sendAtCmd("MQTTPUB", `"${topic}",${qos},0,0,0,"${data}"`)
    }

    //% blockId=nbiot_checkcon block="Check Connection"
    export function nbiot_checkcon() {
        serial.writeLine("AT+CSCON?")
        basic.pause(200)
        serial.writeLine("AT+CGATT?")
        basic.pause(200)
        serial.writeLine("AT+CEREG?")
        basic.pause(200)
    }

    //% blockId=on_mqtt_open block="on Mqtt Open"
    //% weight=50
    export function on_mqtt_open(handler: () => void): void {
        mqttOpen = handler;
    }

    //% blockId=makercloud_connect block="MakerCloud ProductID%prodid DevID%deviceid SN%sn"
    //% weight=40
    export function makercloud_connect(prodid: string, deviceid: string, sn: string): void {
        nbiot_config("mqtt.heclouds.com", 6002, deviceid, prodid, sn)
    }

    //% blockId=makercloud_pub block="MakerCloud tell %topic about %message"
    //% weight=39
    export function makercloud_pub(topic: string, message: string): void {
        message = "_dsn=" + control.deviceSerialNumber() + ",_dn=" + control.deviceName() + "," + message

        let cmd = ",;" + topic + "," + message + ";"
        let hexlen = cmd.length + 3;
        let hexstr = "0500" + int2hex(cmd.length)
        for (let i = 0; i < cmd.length; i++) {
            hexstr += int2hex(cmd.charCodeAt(i))
        }
        sendAtCmd("MQTTPUB", `"$dp",1,0,0,${hexlen},"${hexstr}"`)
    }

    //% blockId=makercloud_pub_keyvalue block="MakerCloud tell %topic about %key = $value"
    //% weight=38
    export function makercloud_pub_keyvalue(topic: string, key: string, value: string): void {
        let message = "_dsn=" + control.deviceSerialNumber() + ",_dn=" + control.deviceName() + "," + key + "=" + value

        let cmd = ",;" + topic + "," + message + ";"
        let hexlen = cmd.length + 3;
        let hexstr = "0500" + int2hex(cmd.length)
        for (let i = 0; i < cmd.length; i++) {
            hexstr += int2hex(cmd.charCodeAt(i))
        }
        sendAtCmd("MQTTPUB", `"$dp",1,0,0,${hexlen},"${hexstr}"`)
    }

    //% blockId=makercloud_mqttsub block="Makercloud i want to listen to %topic"
    //% weight=36
    export function makercloud_mqttsub(topic: string) {
        sendAtCmd("MQTTSUB", `"${topic}",1`)
    }

    /**
         * Listener for MQTT topic
         * @param topic to topic ,eg: "ZXY"
         */
    //% blockId=mc_kt_register_topic_text_message_handler
    //% block="When something talk to %topic, then"
    //% weight=34
    export function registerTopicMessageHandler(topic: string, fn: (textMessage: string) => void) {
        let topicHandler = new StringMessageHandler()
        topicHandler.fn = fn
        topicHandler.topicName = topic
        stringMessageHandlerList.push(topicHandler)
    }

    /**
     * Listener for MQTT topic
     * @param topic to topic ,eg: "ZXY"
     */
    //% blockId=mc_kt_register_topic_key_value_message_handler
    //% block="When something talk to %topic, then"
    //% weight=34
    export function registerTopicKeyValueMessageHandler(topic: string, fn: (key: string, value: string) => void) {
        let topicHandler = new KeyValueMessageHandler()
        topicHandler.fn = fn
        topicHandler.topicName = topic
        keyValueMessageHandlerList.push(topicHandler)
    }

}
