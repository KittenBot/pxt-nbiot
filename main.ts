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

    type EvtStr = (data: string) => void;
    type EvtAct = () => void;
    type EvtNum = (data: number) => void;
    type EvtDict = (topic: string, data: string) => void;

    let netConn: EvtAct = null;
    let mqttOpen: EvtAct = null;

    let lastCmd: string;
    let topicCB: StringMessageHandler[] = []
    let isConn: boolean = false;

    function trim(n: string):string {
        while (n.charCodeAt(n.length-1)<0x1f) {
            n = n.slice(0, n.length-1)
        }
        return n;
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
                for (let i = 0; i < topicCB.length; i++) {
                    if (topicCB[i].topicName == params[4]) {
                        topicCB[i].fn(params[6])
                    }
                }
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

}
