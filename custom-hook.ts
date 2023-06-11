import { useContext, useEffect, useRef } from 'react';

import { message } from 'antd';
import { isAfter, add, differenceInMilliseconds, isBefore } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { usePrevious } from 'hooks/usePrevious';

import { OrderMethod, Timeslot } from '@codegen/generated/graphql';
import { useAppContext } from '@lib/appContext';
import { OrderDeliveryTimeSpecialOption } from '@lib/appContext/types';
import { FacilityContext } from '@lib/facilityContext';
import { formatDate } from '@utils/dateTime';

import { useAvailableTimeSlots } from './useAvailableTimeslots';

type Props = {
  remainingTime: number;
  setRemainingTime: (remainingTime: number) => void;
  nextAvailableTimeSlot: Timeslot | undefined;
};

export const useHandleNextTimeslot = ({
  remainingTime,
  setRemainingTime,
  nextAvailableTimeSlot,
}: Props) => {
  const { facilityTz, selectedFacility } = useContext(FacilityContext);

  const { deliveryTime, orderMethod, setDeliveryTime } = useAppContext();

  const { loadingTimeslots, timeSlots, filteredTimeSlots } =
    useAvailableTimeSlots();

  const previousOrderMethod = usePrevious(orderMethod);

  const isFirstRender = useRef(true);
  const bufferMinutes =
    orderMethod === OrderMethod.Delivery
      ? selectedFacility?.deliveryTimeBuffer
      : 15;

  useEffect(() => {
    if (deliveryTime === OrderDeliveryTimeSpecialOption.Now) return;

    const zonedEarliestTime = utcToZonedTime(
      add(new Date(), {
        minutes: bufferMinutes,
      }),
      facilityTz,
    );
    const isAfterWorkHours =
      !loadingTimeslots && timeSlots.length > 0
        ? isAfter(
            zonedEarliestTime,
            utcToZonedTime(
              new Date(timeSlots[timeSlots.length - 1]?.end),
              facilityTz,
            ),
          )
        : true;

    const isClosed =
      deliveryTime &&
      filteredTimeSlots?.length < 1 &&
      isAfterWorkHours &&
      !loadingTimeslots;

    if (isClosed) {
      if (isFirstRender.current) {
        message.info(
          'Sorry, we are closed for the day. Please try again tomorrow.',
        );
        isFirstRender.current = false;
      }
    } else {
      const formattedDeliveryTime = deliveryTime
        ? new Date(deliveryTime)
        : new Date();

      const isPassedOrderTime = isAfter(
        zonedEarliestTime,
        utcToZonedTime(formattedDeliveryTime, facilityTz),
      );

      const didOrderTimePass =
        isPassedOrderTime && remainingTime < 1 && !loadingTimeslots;

      const hasTimeSlotsAvailable = filteredTimeSlots?.length > 0;

      const isDeliveryTimeBeforeFirstAvailableTimeSlot = hasTimeSlotsAvailable
        ? isBefore(
            new Date(deliveryTime),
            new Date(filteredTimeSlots[0]?.start),
          )
        : false;

      if (didOrderTimePass) {
        setDeliveryTime(nextAvailableTimeSlot?.start);
        setRemainingTime(
          differenceInMilliseconds(
            utcToZonedTime(
              new Date(nextAvailableTimeSlot?.start ?? Date.now()),
              facilityTz,
            ),
            zonedEarliestTime,
          ),
        );

        message.info(`The selected time slot has expired, we have selected the following for you: 
            ${formatDate(
              nextAvailableTimeSlot?.start,
              facilityTz,
              'TIME_ONLY',
            )} - ${formatDate(
          nextAvailableTimeSlot?.end,
          facilityTz,
          'TIME_ONLY',
        )}`);
      }

      if (
        isDeliveryTimeBeforeFirstAvailableTimeSlot &&
        previousOrderMethod !== orderMethod &&
        remainingTime > 1
      ) {
        setDeliveryTime(filteredTimeSlots[0].start);
        setRemainingTime(
          differenceInMilliseconds(
            utcToZonedTime(new Date(filteredTimeSlots[0].start), facilityTz),
            zonedEarliestTime,
          ),
        );
      }

      if (!hasTimeSlotsAvailable) {
        setDeliveryTime(OrderDeliveryTimeSpecialOption.Now);
        setRemainingTime(0);
      }
    }
  }, [
    remainingTime,
    deliveryTime,
    nextAvailableTimeSlot,
    timeSlots,
    loadingTimeslots,
    facilityTz,
    setDeliveryTime,
    setRemainingTime,
    filteredTimeSlots,
    bufferMinutes,
    orderMethod,
    previousOrderMethod,
  ]);
};
