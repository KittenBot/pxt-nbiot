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

    type EvtStr = (data: string) => void;
    type EvtAct = () => void;
    type EvtNum = (data: number) => void;
    type EvtDict = (topic: string, data: string) => void;




    function trim(t: string): string {
        if (t.charAt(t.length - 1) == ' ') {
            t = t.substr(0, t.length - 1)
        }
        return t;
    }

    function seekNext(space: boolean = true): string {
        for (let i = 0; i < v.length; i++) {
            if ((space && v.charAt(i) == ' ') || v.charAt(i) == '\r' || v.charAt(i) == '\n') {
                let ret = v.substr(0, i)
                v = v.substr(i + 1, v.length - i)
                return ret;
            }
        }
        return '';
    }


    /* // no tostring for integer
    function sendCmd(cmdType: number, argc: number, cb: number, extra: string){
        serial.writeString()
    }
    */

    function parseCallback(cb: number) {
        if (Callback.WIFI_STATUS_CHANGED == cb) {
            let stat = parseInt(seekNext())
            if (stat == 5) {
                serial.writeString("WF 10 4 0 2 3 4 5\n") // mqtt callback install
                ipAddr = seekNext()
                if (wifiConn) wifiConn()
            } else {
                ipAddr = ''
                if (wifiDisconn) wifiDisconn()
            }
        } else if (Callback.MQTT_DATA == cb) {
            let topic: string = seekNext()
            let data = trim(seekNext(false));
            for (let i = 0; i < 5; i++) {
                let cmp = mqttCbKey[i].compare(topic)
                if (cmp == 0) {
                    mqttCb[i](data)
                    break;
                }
            }
            if (mqttCbTopicData) {
                mqttCbTopicData(topic, data)
            }
        } else if (Callback.MQTT_CONN == cb) {
            // resubscribe?
            for (let i = 0; i < mqttCbCnt; i++) {
                serial.writeString("WF 12 2 0 " + mqttCbKey[i] + ' 0\n')
                basic.pause(300)
            }
        }
    }

    serial.onDataReceived('\n', function () {
        v = serial.readString()
        
    })

    /**
     * Wifi connection io init
     * @param tx Tx pin; eg: SerialPin.P1
     * @param rx Rx pin; eg: SerialPin.P2
    */
    //% blockId=wifi_init block="Wifi init|Tx pin %tx|Rx pin %rx"
    //% weight=100
    export function wifi_init(tx: SerialPin, rx: SerialPin): void {
        serial.redirect(
            SerialPin.P13,
            SerialPin.P16,
            BaudRate.BaudRate115200
        )
        basic.pause(100)
        serial.setTxBufferSize(64)
        serial.setRxBufferSize(64)
        serial.readString()
    }

}
